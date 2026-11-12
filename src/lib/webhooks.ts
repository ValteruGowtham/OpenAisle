import { markOrderCaptured } from "@/lib/checkout";
import { getDb } from "@/lib/db";
import { fromCents, toCents } from "@/lib/money";
import { getOrder } from "@/lib/paypal";

/**
 * PayPal webhook processing (called only after signature verification).
 * Every branch is idempotent: PayPal retries deliveries, and the return page / Copilot may already
 * have applied the same change.
 */

type Money = { value?: string; currency_code?: string };
type Link = { href?: string; rel?: string };

export type PayPalWebhookEvent = {
  id?: string;
  event_type?: string;
  resource?: {
    id?: string;
    status?: string;
    amount?: Money;
    custom_id?: string;
    invoice_id?: string;
    links?: Link[];
    supplementary_data?: { related_ids?: { order_id?: string } };
    seller_payable_breakdown?: { total_refunded_amount?: Money };
  };
};

export type WebhookResult = { handled: boolean; action: string; order_ref?: string };

async function onCaptureCompleted(event: PayPalWebhookEvent): Promise<WebhookResult> {
  const r = event.resource ?? {};
  const db = getDb();
  const paypalOrderId = r.supplementary_data?.related_ids?.order_id;

  const order =
    (paypalOrderId && (await db.order.findUnique({ where: { paypalOrderId } }))) ||
    (r.custom_id && (await db.order.findUnique({ where: { id: r.custom_id } }))) ||
    null;
  if (!order) return { handled: false, action: "unknown_order" };
  if (r.status !== "COMPLETED" || !r.id) return { handled: true, action: `capture_${r.status ?? "unknown"}`, order_ref: order.ref };
  if (order.status === "COMPLETED" || order.status === "REFUNDED") {
    return { handled: true, action: "already_completed", order_ref: order.ref };
  }

  // The capture resource has no payer details; fetch them once (best effort).
  let buyerEmail: string | null = null;
  try {
    buyerEmail = (await getOrder(order.paypalOrderId)).payer?.email_address ?? null;
  } catch (err) {
    console.warn(`[webhook] couldn't fetch payer email for ${order.ref}: ${err instanceof Error ? err.message : err}`);
  }

  const changed = await markOrderCaptured(order.id, { captureId: r.id, buyerEmail, source: "webhook" });
  return { handled: true, action: changed ? "marked_completed" : "already_completed", order_ref: order.ref };
}

async function onCaptureRefunded(event: PayPalWebhookEvent): Promise<WebhookResult> {
  const r = event.resource ?? {};
  const db = getDb();

  // Resource is the refund; its "up" link points at the refunded capture.
  const upHref = r.links?.find((l) => l.rel === "up")?.href ?? "";
  const captureId = upHref.match(/\/captures\/([^/?]+)/)?.[1];
  if (!captureId) return { handled: false, action: "no_capture_link" };

  const order = await db.order.findFirst({ where: { captureId } });
  if (!order) return { handled: false, action: "unknown_order" };

  const refundId = r.id ?? event.id ?? "unknown";
  const totalCents = toCents(order.total);
  const refundedValue = r.seller_payable_breakdown?.total_refunded_amount?.value ?? r.amount?.value;
  const refundedCents = refundedValue ? toCents(refundedValue) : totalCents;
  const full = refundedCents >= totalCents;

  return db.$transaction(async (tx) => {
    if (full) {
      await tx.order.updateMany({
        where: { id: order.id, status: { not: "REFUNDED" } },
        data: { status: "REFUNDED" },
      });
    }

    // One REFUNDED event per refund id (PayPal retries; the Copilot may have logged its own action).
    const already = await tx.agentEvent.findFirst({
      where: { storeId: order.storeId, type: "REFUNDED", payload: { path: ["refund_id"], equals: refundId } },
      select: { id: true },
    });
    if (already) return { handled: true, action: "already_recorded", order_ref: order.ref };

    await tx.agentEvent.create({
      data: {
        storeId: order.storeId,
        type: "REFUNDED",
        channel: order.channel,
        payload: {
          order_ref: order.ref,
          refund_id: refundId,
          amount: fromCents(r.amount?.value ? toCents(r.amount.value) : refundedCents),
          total_refunded: fromCents(refundedCents),
          full_refund: full,
          source: "webhook",
        },
      },
    });
    return { handled: true, action: full ? "marked_refunded" : "partial_refund_recorded", order_ref: order.ref };
  });
}

export async function handlePayPalWebhook(event: PayPalWebhookEvent): Promise<WebhookResult> {
  switch (event.event_type) {
    case "PAYMENT.CAPTURE.COMPLETED":
      return onCaptureCompleted(event);
    case "PAYMENT.CAPTURE.REFUNDED":
      return onCaptureRefunded(event);
    default:
      return { handled: false, action: "ignored_event_type" };
  }
}
