import { getDb } from "@/lib/db";
import { fromCents, toCents } from "@/lib/money";
import { captureOrder, firstCapture, getOrder, PayPalError, type PayPalOrder } from "@/lib/paypal";
import type { CheckoutLine } from "@/lib/store-tools";

export type CaptureOutcome =
  | {
      kind: "completed";
      orderRef: string;
      items: CheckoutLine[];
      total: string;
      currency: string;
      buyerEmail: string | null;
      captureId: string | null;
      storeName: string;
    }
  | { kind: "not_found" }
  | { kind: "not_approved"; orderRef: string }
  | { kind: "pending"; orderRef: string; status: string }
  | { kind: "error"; message: string; debugId?: string };

const hasIssue = (err: unknown, issue: string) =>
  err instanceof PayPalError &&
  Array.isArray(err.details) &&
  (err.details as { issue?: string }[]).some((d) => d.issue === issue);

/**
 * Capture a PayPal order after buyer approval. Idempotent: safe on refresh, double-submit or a
 * racing webhook. Only the request that flips the order to COMPLETED logs the event and adjusts stock.
 */
export async function captureCheckout(slug: string, paypalOrderId: string): Promise<CaptureOutcome> {
  const db = getDb();
  const order = await db.order.findFirst({
    where: { paypalOrderId, store: { slug } },
    include: { store: { select: { name: true } } },
  });
  if (!order) return { kind: "not_found" };

  const completed = (o: typeof order): CaptureOutcome => ({
    kind: "completed",
    orderRef: o.ref,
    items: o.items as CheckoutLine[],
    total: fromCents(toCents(o.total)),
    currency: o.currency,
    buyerEmail: o.buyerEmail,
    captureId: o.captureId,
    storeName: o.store.name,
  });

  if (order.status === "COMPLETED" || order.status === "REFUNDED") return completed(order);

  let pp: PayPalOrder;
  try {
    pp = await captureOrder(paypalOrderId);
  } catch (err) {
    if (hasIssue(err, "ORDER_ALREADY_CAPTURED")) {
      pp = await getOrder(paypalOrderId);
    } else if (hasIssue(err, "ORDER_NOT_APPROVED")) {
      return { kind: "not_approved", orderRef: order.ref };
    } else {
      console.error("[capture] failed", err);
      return {
        kind: "error",
        message: "We couldn't confirm your payment with PayPal. No money has been taken twice. Please refresh in a moment.",
        debugId: err instanceof PayPalError ? err.debugId : undefined,
      };
    }
  }

  const capture = firstCapture(pp);
  if (pp.status !== "COMPLETED" || capture?.status !== "COMPLETED") {
    return { kind: "pending", orderRef: order.ref, status: capture?.status ?? pp.status };
  }

  const buyerEmail = pp.payer?.email_address ?? null;
  const items = order.items as CheckoutLine[];

  await db.$transaction(async (tx) => {
    // Conditional update: only one request can win the CREATED/APPROVED -> COMPLETED transition.
    const { count } = await tx.order.updateMany({
      where: { id: order.id, status: { in: ["CREATED", "APPROVED"] } },
      data: { status: "COMPLETED", captureId: capture.id, buyerEmail },
    });
    if (count !== 1) return;

    for (const it of items) {
      await tx.product.updateMany({
        where: { storeId: order.storeId, sku: it.sku, stock: { gte: it.quantity } },
        data: { stock: { decrement: it.quantity } },
      });
    }
    await tx.agentEvent.create({
      data: {
        storeId: order.storeId,
        type: "PAYMENT_CAPTURED",
        channel: order.channel,
        payload: {
          order_ref: order.ref,
          total: fromCents(toCents(order.total)),
          currency: order.currency,
          capture_id: capture.id,
          agentClient: order.agentClient,
        },
      },
    });
  });

  const fresh = await db.order.findUniqueOrThrow({
    where: { id: order.id },
    include: { store: { select: { name: true } } },
  });
  return completed(fresh);
}
