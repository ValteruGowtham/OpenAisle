import { z } from "zod";
import { tool } from "ai";
import type { Channel } from "@/generated/prisma/enums";
import { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { logEvent } from "@/lib/events";
import { formatMoney, fromCents, sumCents, toCents } from "@/lib/money";
import { createOrder, PayPalError } from "@/lib/paypal";

/**
 * The 5 buyer tools. Plain async functions shared by the web chat and the MCP server.
 * Every call is logged as an AgentEvent. Prices always come from the DB, never from the caller.
 */

export type ToolCtx = {
  channel: Channel;
  agentClient?: string;
  /** Set false for UI polling so the live feed isn't flooded. */
  log?: boolean;
  /**
   * When true, create_checkout only returns a priced preview and asks for confirmation instead of
   * creating an order (web chat sets this until the buyer's latest message is an explicit yes).
   */
  requireConfirmation?: boolean;
};

export class StoreNotFoundError extends Error {
  constructor(slug: string) {
    super(`Store "${slug}" not found`);
  }
}

// ---------- Input schemas ----------

export const searchProductsInput = z.object({
  query: z.string().max(200).describe("What the buyer is looking for, e.g. 'red silk scarf'."),
  max_price: z.number().positive().optional().describe("Maximum unit price in the store currency."),
  limit: z.number().int().min(1).max(8).optional().describe("Max results (default 6, max 8)."),
});

export const getProductInput = z.object({
  sku: z.string().max(64).describe("Product SKU from search results."),
});

export const createCheckoutInput = z.object({
  items: z
    .array(
      z.object({
        sku: z.string().max(64),
        quantity: z.number().int().min(1).max(10),
      }),
    )
    .min(1)
    .max(10)
    .describe("Items to buy. Prices are computed by the store, never pass prices."),
  buyer_note: z.string().max(200).optional().describe("Optional note from the buyer."),
});

export const getOrderStatusInput = z.object({
  order_ref: z.string().max(32).describe("Order reference, e.g. OA-1001."),
});

export const getStoreInfoInput = z.object({});

// ---------- Helpers ----------

const APP_URL = () => (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");

async function loadStore(slug: string) {
  const store = await getDb().store.findUnique({ where: { slug } });
  if (!store) throw new StoreNotFoundError(slug);
  return store;
}

const STOP_WORDS = new Set([
  "a", "an", "the", "for", "and", "or", "of", "to", "in", "on", "with", "under", "below",
  "less", "than", "some", "any", "me", "my", "i", "want", "need", "looking", "show", "find",
  "please", "something", "item", "items", "product", "products", "buy",
]);

const stem = (w: string) =>
  w.endsWith("ves") ? w.slice(0, -3) + "f" : w.endsWith("s") && w.length > 3 ? w.slice(0, -1) : w;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/'s\b/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map(stem);
}

function terms(query: string): string[] {
  return tokenize(query).filter((w) => w.length >= 2 && !STOP_WORDS.has(w) && !/^\d+$/.test(w));
}

/** Whole-word match (or prefix for 4+ chars), so "men" doesn't match "women". */
const matches = (tokens: string[], w: string) =>
  tokens.some((t) => t === w || (w.length >= 4 && t.startsWith(w)));

type ProductRow = Prisma.ProductGetPayload<object>;

function compactProduct(p: ProductRow, currency: string) {
  return {
    sku: p.sku,
    title: p.title,
    price: fromCents(toCents(p.price)),
    currency,
    stock: p.stock,
    in_stock: p.stock > 0,
    // Relative (generated swatch) URLs are made absolute so external agents can fetch them.
    image_url: p.imageUrl?.startsWith("/") ? `${APP_URL()}${p.imageUrl}` : p.imageUrl,
    summary: p.agentSummary ?? p.description ?? "",
  };
}

export type CompactProduct = ReturnType<typeof compactProduct>;

// ---------- 1. search_products ----------

export async function searchProducts(
  slug: string,
  input: z.infer<typeof searchProductsInput>,
  ctx: ToolCtx,
) {
  const store = await loadStore(slug);
  const limit = input.limit ?? 6;
  const words = terms(input.query);
  const maxCents = input.max_price !== undefined ? toCents(input.max_price) : undefined;

  const products = await getDb().product.findMany({ where: { storeId: store.id } });
  const ranked = products
    .filter((p) => maxCents === undefined || toCents(p.price) <= maxCents)
    .map((p) => {
      const attrs = Object.values((p.attributes ?? {}) as Record<string, unknown>).join(" ");
      const hay = tokenize([p.title, p.description, p.agentSummary, p.tags.join(" "), attrs].join(" "));
      const titleTokens = tokenize(p.title);
      const score = words.reduce(
        (s, w) => s + (matches(hay, w) ? 1 : 0) + (matches(titleTokens, w) ? 0.5 : 0),
        0,
      );
      return { p, score };
    })
    .filter(({ score }) => words.length === 0 || score > 0)
    .sort((a, b) => b.score - a.score || Number(b.p.stock > 0) - Number(a.p.stock > 0))
    .slice(0, limit)
    .map(({ p }) => compactProduct(p, store.currency));

  if (ctx.log !== false) {
    await logEvent({
      storeId: store.id,
      type: "SEARCH",
      channel: ctx.channel,
      query: input.query,
      resultCount: ranked.length,
      payload: { tool: "search_products", max_price: input.max_price ?? null, agentClient: ctx.agentClient ?? null },
    });
  }

  return {
    query: input.query,
    results: ranked,
    note: ranked.length === 0 ? "No matching products in this store. Do not suggest products that are not listed." : undefined,
  };
}

// ---------- 2. get_product ----------

export async function getProduct(slug: string, input: z.infer<typeof getProductInput>, ctx: ToolCtx) {
  const store = await loadStore(slug);
  const p = await getDb().product.findUnique({
    where: { storeId_sku: { storeId: store.id, sku: input.sku.trim().toUpperCase() } },
  });

  if (ctx.log !== false) {
    await logEvent({
      storeId: store.id,
      type: "VIEW",
      channel: ctx.channel,
      payload: { tool: "get_product", sku: input.sku, found: Boolean(p), agentClient: ctx.agentClient ?? null },
    });
  }

  if (!p) return { found: false as const, sku: input.sku, message: "No product with that SKU." };
  return {
    found: true as const,
    product: {
      ...compactProduct(p, store.currency),
      description: p.description,
      attributes: p.attributes,
      tags: p.tags,
    },
    shipping_policy: store.shippingPolicy,
    return_policy: store.returnPolicy,
  };
}

// ---------- 3. create_checkout ----------

export type CheckoutLine = { sku: string; title: string; quantity: number; unit_price: string; line_total: string };

export type CreateCheckoutResult =
  | { ok: true; order_ref: string; items: CheckoutLine[]; total: string; currency: string; approve_url: string }
  | { ok: false; needs_confirmation: true; items: CheckoutLine[]; total: string; currency: string; reason: string }
  | { ok: false; needs_confirmation?: false; reason: string };

export async function createCheckout(
  slug: string,
  input: z.infer<typeof createCheckoutInput>,
  ctx: ToolCtx,
): Promise<CreateCheckoutResult> {
  const store = await loadStore(slug);
  const db = getDb();

  const blocked = async (reason: string, details: Prisma.InputJsonObject = {}) => {
    await logEvent({
      storeId: store.id,
      type: "POLICY_BLOCKED",
      channel: ctx.channel,
      payload: { tool: "create_checkout", reason, ...details, agentClient: ctx.agentClient ?? null },
    });
    return { ok: false as const, reason };
  };

  // Merge duplicate SKUs.
  const qty = new Map<string, number>();
  for (const it of input.items) {
    const sku = it.sku.trim().toUpperCase();
    qty.set(sku, (qty.get(sku) ?? 0) + it.quantity);
  }
  const skus = [...qty.keys()];

  const products = await db.product.findMany({ where: { storeId: store.id, sku: { in: skus } } });
  const bySku = new Map(products.map((p) => [p.sku, p]));

  const missing = skus.filter((s) => !bySku.has(s));
  if (missing.length) return blocked(`These items aren't sold here: ${missing.join(", ")}.`, { skus: missing });

  for (const [sku, q] of qty) {
    const p = bySku.get(sku)!;
    if (p.stock <= 0) return blocked(`"${p.title}" is sold out.`, { sku });
    if (q > p.stock) return blocked(`Only ${p.stock} of "${p.title}" left in stock (requested ${q}).`, { sku, requested: q, stock: p.stock });
  }

  // Recompute prices from the DB, in integer cents.
  const lines = skus.map((sku) => {
    const p = bySku.get(sku)!;
    const unit = toCents(p.price);
    const quantity = qty.get(sku)!;
    return { p, unit, quantity, lineCents: unit * quantity };
  });
  const totalCents = sumCents(lines.map((l) => l.lineCents));
  const maxCents = toCents(store.maxOrderValue);
  if (totalCents > maxCents) {
    return blocked(
      `Order total ${formatMoney(totalCents, store.currency)} exceeds this store's agent order limit of ${formatMoney(maxCents, store.currency)}. Try fewer items.`,
      { total: fromCents(totalCents), max_order_value: fromCents(maxCents) },
    );
  }

  const items: CheckoutLine[] = lines.map((l) => ({
    sku: l.p.sku,
    title: l.p.title,
    quantity: l.quantity,
    unit_price: fromCents(l.unit),
    line_total: fromCents(l.lineCents),
  }));
  const total = fromCents(totalCents);

  // Buyer hasn't explicitly confirmed yet: return a DB-priced preview, create nothing.
  if (ctx.requireConfirmation) {
    if (ctx.log !== false) {
      await logEvent({
        storeId: store.id,
        type: "VIEW",
        channel: ctx.channel,
        payload: { tool: "create_checkout", stage: "awaiting_confirmation", total, agentClient: ctx.agentClient ?? null },
      });
    }
    return {
      ok: false,
      needs_confirmation: true,
      items,
      total,
      currency: store.currency,
      reason: "Not created yet. Show the buyer these items and the total, and ask them to confirm. Call create_checkout again after they say yes.",
    };
  }

  // Reserve an order ref first (placeholder PayPal id), then create the PayPal order.
  let order: { id: string; ref: string } | null = null;
  for (let attempt = 0; attempt < 5 && !order; attempt++) {
    const count = await db.order.count();
    const ref = `OA-${1001 + count + attempt}`;
    try {
      order = await db.order.create({
        data: {
          storeId: store.id,
          ref,
          paypalOrderId: `pending-${crypto.randomUUID()}`,
          status: "CREATED",
          items,
          total,
          currency: store.currency,
          channel: ctx.channel,
          agentClient: ctx.agentClient,
        },
        select: { id: true, ref: true },
      });
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
    }
  }
  if (!order) throw new Error("Could not allocate an order reference");

  try {
    const paypal = await createOrder({
      currency: store.currency,
      referenceId: order.ref,
      idempotencyKey: order.id,
      brandName: store.name,
      description: input.buyer_note ? `Note: ${input.buyer_note}` : `${store.name} order ${order.ref}`,
      returnUrl: `${APP_URL()}/s/${store.slug}/checkout/return`,
      cancelUrl: `${APP_URL()}/s/${store.slug}?checkout=cancelled`,
      items: lines.map((l) => ({ name: l.p.title, sku: l.p.sku, unitAmount: l.unit, quantity: l.quantity })),
    });

    await db.order.update({ where: { id: order.id }, data: { paypalOrderId: paypal.id } });
    await logEvent({
      storeId: store.id,
      type: "CHECKOUT_CREATED",
      channel: ctx.channel,
      payload: { tool: "create_checkout", order_ref: order.ref, total, currency: store.currency, items: items.length, agentClient: ctx.agentClient ?? null },
    });

    return { ok: true, order_ref: order.ref, items, total, currency: store.currency, approve_url: paypal.approveUrl };
  } catch (err) {
    await db.order.update({ where: { id: order.id }, data: { status: "CANCELLED" } }).catch(() => {});
    console.error("[create_checkout] PayPal error", err);
    const debug = err instanceof PayPalError && err.debugId ? ` (PayPal debug id ${err.debugId})` : "";
    return { ok: false, reason: `PayPal couldn't start checkout right now. Please try again.${debug}` };
  }
}

// ---------- 4. get_order_status ----------

export async function getOrderStatus(slug: string, input: z.infer<typeof getOrderStatusInput>, ctx: ToolCtx) {
  const store = await loadStore(slug);
  const order = await getDb().order.findFirst({
    where: { storeId: store.id, ref: input.order_ref.trim().toUpperCase() },
  });

  if (ctx.log !== false) {
    await logEvent({
      storeId: store.id,
      type: "VIEW",
      channel: ctx.channel,
      payload: { tool: "get_order_status", order_ref: input.order_ref, found: Boolean(order), agentClient: ctx.agentClient ?? null },
    });
  }

  if (!order) return { found: false as const, order_ref: input.order_ref, message: "No order with that reference." };
  return {
    found: true as const,
    order_ref: order.ref,
    status: order.status,
    total: fromCents(toCents(order.total)),
    currency: order.currency,
    items: order.items as CheckoutLine[],
    created_at: order.createdAt.toISOString(),
    tracking: order.trackingNumber ? { number: order.trackingNumber, carrier: order.carrier } : null,
  };
}

// ---------- 5. get_store_info ----------

export async function getStoreInfo(slug: string, ctx: ToolCtx) {
  const store = await loadStore(slug);
  const productCount = await getDb().product.count({ where: { storeId: store.id } });

  if (ctx.log !== false) {
    await logEvent({
      storeId: store.id,
      type: "VIEW",
      channel: ctx.channel,
      payload: { tool: "get_store_info", agentClient: ctx.agentClient ?? null },
    });
  }

  return {
    name: store.name,
    tagline: store.tagline,
    description: store.description,
    currency: store.currency,
    shipping_policy: store.shippingPolicy,
    return_policy: store.returnPolicy,
    max_order_value: fromCents(toCents(store.maxOrderValue)),
    product_count: productCount,
    payment: "PayPal (buyer approves every payment on PayPal)",
  };
}

// ---------- Tool descriptions (shared with MCP) ----------

export const TOOL_DESCRIPTIONS = {
  search_products: "Search this store's catalog. Returns matching products with SKU, price and stock.",
  get_product: "Get full details for one product by SKU, plus shipping and return policy.",
  create_checkout:
    "Create a PayPal checkout for items (SKU + quantity). Prices are set by the store. Only call after the buyer confirmed items and total. Returns approve_url for the buyer.",
  get_order_status: "Get the status of an order by its reference (e.g. OA-1001).",
  get_store_info: "Get store details: description, currency, shipping and return policies, order limit.",
} as const;

/** AI SDK tool set for the web chat. */
export function buildAiTools(slug: string, ctx: ToolCtx) {
  return {
    search_products: tool({
      description: TOOL_DESCRIPTIONS.search_products,
      inputSchema: searchProductsInput,
      execute: (input) => searchProducts(slug, input, ctx),
    }),
    get_product: tool({
      description: TOOL_DESCRIPTIONS.get_product,
      inputSchema: getProductInput,
      execute: (input) => getProduct(slug, input, ctx),
    }),
    create_checkout: tool({
      description: TOOL_DESCRIPTIONS.create_checkout,
      inputSchema: createCheckoutInput,
      execute: (input) => createCheckout(slug, input, ctx),
    }),
    get_order_status: tool({
      description: TOOL_DESCRIPTIONS.get_order_status,
      inputSchema: getOrderStatusInput,
      execute: (input) => getOrderStatus(slug, input, ctx),
    }),
    get_store_info: tool({
      description: TOOL_DESCRIPTIONS.get_store_info,
      inputSchema: getStoreInfoInput,
      execute: () => getStoreInfo(slug, ctx),
    }),
  };
}

export type StoreTools = ReturnType<typeof buildAiTools>;
