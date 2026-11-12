import { fromCents, sumCents, type Cents } from "@/lib/money";

/**
 * Thin PayPal REST client (Orders v2, Payments v2, Catalog Products, Webhooks).
 * Server-only. Never vault payment sources (sandbox: NOT_ENABLED_TO_VAULT_PAYMENT_SOURCE).
 */

export const PAYPAL_BASE =
  process.env.PAYPAL_ENV === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

export class PayPalError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly debugId?: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

// ---------- OAuth (cached in memory) ----------

let cachedToken: { value: string; expiresAt: number } | null = null;
let inflight: Promise<string> | null = null;

export async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.value;
  if (inflight) return inflight;

  inflight = (async () => {
    const id = process.env.PAYPAL_CLIENT_ID;
    const secret = process.env.PAYPAL_CLIENT_SECRET;
    if (!id || !secret) throw new Error("PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET are not set");

    const res = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
      cache: "no-store",
    });
    if (!res.ok) throw await toPayPalError(res, "OAuth token");
    const json = (await res.json()) as { access_token: string; expires_in: number };
    cachedToken = {
      value: json.access_token,
      expiresAt: Date.now() + Math.max(0, json.expires_in - 60) * 1000,
    };
    return json.access_token;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

async function toPayPalError(res: Response, context: string): Promise<PayPalError> {
  const debugHeader = res.headers.get("paypal-debug-id") ?? undefined;
  let body: {
    name?: string;
    message?: string;
    error?: string;
    error_description?: string;
    debug_id?: string;
    details?: { issue?: string; description?: string }[];
  } = {};
  try {
    body = await res.json();
  } catch {
    // non-JSON body
  }
  const debugId = body.debug_id ?? debugHeader;
  const name = body.name ?? body.error ?? `HTTP_${res.status}`;
  const issue = body.details?.[0];
  const detail = issue ? ` [${issue.issue}${issue.description ? `: ${issue.description}` : ""}]` : "";
  const msg = body.message ?? body.error_description ?? res.statusText;
  return new PayPalError(
    `PayPal ${context} failed (${res.status} ${name}): ${msg}${detail}${debugId ? ` (debug_id ${debugId})` : ""}`,
    res.status,
    name,
    debugId,
    body.details,
  );
}

type FetchOpts = { method?: "GET" | "POST" | "PATCH"; body?: unknown; requestId?: string };

/** Drop the cached token if it's the one that was rejected (a concurrent call may have refreshed it). */
function invalidateToken(rejected: string) {
  if (cachedToken?.value === rejected) cachedToken = null;
}

export async function paypalFetch<T>(path: string, opts: FetchOpts = {}, isRetry = false): Promise<T> {
  const token = await getAccessToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
  if (opts.requestId) headers["PayPal-Request-Id"] = opts.requestId;

  const res = await fetch(`${PAYPAL_BASE}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    cache: "no-store",
  });
  // Token expired or revoked (e.g. after app permissions changed): fetch a fresh one and retry once.
  // Safe to repeat: PayPal rejected the request before processing it, and POSTs keep their
  // PayPal-Request-Id idempotency key.
  if (res.status === 401 && !isRetry) {
    invalidateToken(token);
    return paypalFetch<T>(path, opts, true);
  }
  if (!res.ok) throw await toPayPalError(res, `${opts.method ?? "GET"} ${path}`);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// ---------- Types ----------

export type PayPalLink = { href: string; rel: string; method?: string };

export type PayPalAmount = { currency_code: string; value: string };

export type PayPalCapture = {
  id: string;
  status: "COMPLETED" | "DECLINED" | "PARTIALLY_REFUNDED" | "PENDING" | "REFUNDED" | "FAILED";
  amount: PayPalAmount;
  create_time?: string;
};

export type PayPalOrder = {
  id: string;
  status: "CREATED" | "SAVED" | "APPROVED" | "VOIDED" | "COMPLETED" | "PAYER_ACTION_REQUIRED";
  links: PayPalLink[];
  payer?: { email_address?: string; name?: { given_name?: string; surname?: string } };
  purchase_units?: {
    reference_id?: string;
    amount?: PayPalAmount;
    payments?: { captures?: PayPalCapture[] };
  }[];
};

export type PayPalRefund = {
  id: string;
  status: "CANCELLED" | "FAILED" | "PENDING" | "COMPLETED";
  amount?: PayPalAmount;
};

export type PayPalCatalogProduct = { id: string; name: string };

// ---------- Orders ----------

export type OrderItemInput = {
  name: string;
  sku: string;
  unitAmount: Cents;
  quantity: number;
  description?: string;
};

export type CreateOrderInput = {
  items: OrderItemInput[];
  currency: string;
  /** Human order ref shown to the buyer (e.g. OA-1001). */
  referenceId: string;
  /** Globally unique id (our DB order id): used for invoice_id + idempotency key. */
  idempotencyKey: string;
  returnUrl: string;
  cancelUrl: string;
  brandName?: string;
  description?: string;
};

export async function createOrder(input: CreateOrderInput) {
  const itemTotal = sumCents(input.items.map((i) => i.unitAmount * i.quantity));
  const value = fromCents(itemTotal);

  const order = await paypalFetch<PayPalOrder>("/v2/checkout/orders", {
    method: "POST",
    requestId: `create-${input.idempotencyKey}`,
    body: {
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: input.referenceId,
          // invoice_id must be unique per merchant account; refs can repeat after a re-seed.
          invoice_id: `${input.referenceId}-${input.idempotencyKey}`.slice(0, 127),
          custom_id: input.idempotencyKey,
          description: input.description?.slice(0, 127),
          amount: {
            currency_code: input.currency,
            value,
            breakdown: { item_total: { currency_code: input.currency, value } },
          },
          items: input.items.map((i) => ({
            name: i.name.slice(0, 127),
            sku: i.sku.slice(0, 127),
            description: i.description?.slice(0, 127),
            quantity: String(i.quantity),
            category: "PHYSICAL_GOODS",
            unit_amount: { currency_code: input.currency, value: fromCents(i.unitAmount) },
          })),
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: input.brandName?.slice(0, 127),
            user_action: "PAY_NOW",
            shipping_preference: "GET_FROM_FILE",
            return_url: input.returnUrl,
            cancel_url: input.cancelUrl,
          },
        },
      },
    },
  });

  const approveUrl = order.links.find((l) => l.rel === "payer-action" || l.rel === "approve")?.href;
  if (!approveUrl) throw new Error(`PayPal order ${order.id} has no approve link`);
  return { id: order.id, status: order.status, approveUrl, total: value };
}

export function getOrder(orderId: string) {
  return paypalFetch<PayPalOrder>(`/v2/checkout/orders/${encodeURIComponent(orderId)}`);
}

/** Idempotent: PayPal dedupes on the request id, so repeated calls return the same capture. */
export function captureOrder(orderId: string) {
  return paypalFetch<PayPalOrder>(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    method: "POST",
    requestId: `capture-${orderId}`,
    body: {},
  });
}

export function firstCapture(order: PayPalOrder): PayPalCapture | undefined {
  return order.purchase_units?.[0]?.payments?.captures?.[0];
}

// ---------- Payments ----------

export function refundCapture(
  captureId: string,
  opts: { amountCents?: Cents; currency?: string; note?: string; requestId?: string } = {},
) {
  const body: Record<string, unknown> = {};
  if (opts.amountCents !== undefined) {
    body.amount = { currency_code: opts.currency ?? "USD", value: fromCents(opts.amountCents) };
  }
  if (opts.note) body.note_to_payer = opts.note.slice(0, 255);
  return paypalFetch<PayPalRefund>(`/v2/payments/captures/${encodeURIComponent(captureId)}/refund`, {
    method: "POST",
    requestId: opts.requestId ?? `refund-${captureId}-${opts.amountCents ?? "full"}`,
    body,
  });
}

// ---------- Tracking ----------

export function addTracking(
  orderId: string,
  input: { captureId: string; trackingNumber: string; carrier: string; notifyPayer?: boolean },
) {
  return paypalFetch<PayPalOrder>(`/v2/checkout/orders/${encodeURIComponent(orderId)}/track`, {
    method: "POST",
    requestId: `track-${orderId}-${input.trackingNumber}`,
    body: {
      capture_id: input.captureId,
      tracking_number: input.trackingNumber,
      carrier: input.carrier,
      notify_payer: input.notifyPayer ?? true,
    },
  });
}

// ---------- Catalog Products ----------

export function createCatalogProduct(input: {
  name: string;
  description?: string;
  imageUrl?: string;
  homeUrl?: string;
  category?: string;
  requestId?: string;
}) {
  return paypalFetch<PayPalCatalogProduct>("/v1/catalogs/products", {
    method: "POST",
    requestId: input.requestId,
    body: {
      name: input.name.slice(0, 127),
      description: input.description?.slice(0, 256),
      type: "PHYSICAL",
      category: input.category ?? "CLOTHING_ACCESSORIES_AND_SHOES",
      image_url: input.imageUrl,
      home_url: input.homeUrl,
    },
  });
}

// ---------- Webhooks ----------

/** Verifies a webhook via PayPal's verify-webhook-signature API. Pass the raw request body. */
export async function verifyWebhookSignature(headers: Headers, rawBody: string): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) throw new Error("PAYPAL_WEBHOOK_ID is not set");

  const res = await paypalFetch<{ verification_status: "SUCCESS" | "FAILURE" }>(
    "/v1/notifications/verify-webhook-signature",
    {
      method: "POST",
      body: {
        auth_algo: headers.get("paypal-auth-algo"),
        cert_url: headers.get("paypal-cert-url"),
        transmission_id: headers.get("paypal-transmission-id"),
        transmission_sig: headers.get("paypal-transmission-sig"),
        transmission_time: headers.get("paypal-transmission-time"),
        webhook_id: webhookId,
        webhook_event: JSON.parse(rawBody),
      },
    },
  );
  return res.verification_status === "SUCCESS";
}
