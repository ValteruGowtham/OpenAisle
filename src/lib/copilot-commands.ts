import {
  addTracking,
  createAndSendInvoice,
  latestPaidOrder,
  refundOrder,
  resolveOrder,
} from "@/lib/copilot";
import { formatMoney, toCents } from "@/lib/money";

/**
 * No-AI command path for the merchant copilot. Clear, imperative requests (refund an order,
 * add tracking, send an invoice, check an order) are parsed with plain rules and executed
 * directly through the PayPal Agent Toolkit: zero LLM tokens and no "AI is busy". Anything else
 * returns null and goes to the AI.
 */

type Store = { id: string; slug: string; name: string; currency: string };

export type DirectResult = {
  /** Tool name, so the chat UI renders the same result pill as an AI tool call. */
  toolName: "create_refund" | "create_shipment_tracking" | "create_and_send_invoice" | "lookup_order";
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  reply: string;
};

// OA-1001, or a PayPal capture / order id (17+ uppercase alphanumerics).
const ORDER_REF = /\bOA-\d{3,}\b/i;
const PAYPAL_ID = /\b[A-Z0-9]{17,20}\b/;
const RECENT = /\b(most\s+recent|latest|last|newest)\b/i;
const CARRIERS = /\b(UPS|FEDEX|FED\s?EX|USPS|DHL|BLUEDART|BLUE\s?DART|DTDC|INDIA\s?POST|ARAMEX)\b/i;

function findOrderId(text: string): string | null {
  return text.match(ORDER_REF)?.[0] ?? text.match(PAYPAL_ID)?.[0] ?? null;
}

function errorText(err: unknown): string {
  if (typeof err === "string") return err;
  const e = err as { message?: string; name?: string } | undefined;
  return e?.message ?? e?.name ?? "PayPal returned an error";
}

async function pickOrder(store: Store, text: string) {
  const id = findOrderId(text);
  if (id) return { id, order: await resolveOrder(store, id) };
  if (RECENT.test(text)) return { id: "most recent paid order", order: await latestPaidOrder(store) };
  return { id: null, order: null };
}

async function refundCommand(store: Store, text: string): Promise<DirectResult> {
  const { id, order } = await pickOrder(store, text);
  if (!id) {
    return { toolName: "create_refund", input: {}, output: { ok: false, error: "Which order? Try “Refund OA-1003” or a PayPal capture id." }, reply: "Which order should I refund? Give an order ref like **OA-1003** or a PayPal capture id." };
  }
  if (!order) {
    return { toolName: "create_refund", input: { id }, output: { ok: false, error: `No order ${id} in this store` }, reply: `I couldn't find **${id}** in this store.` };
  }

  // Optional partial amount: "refund $10 on OA-1003".
  const amountMatch = text.match(/\$\s?(\d+(?:\.\d{1,2})?)/);
  const amount = amountMatch ? { currency_code: store.currency, value: Number(amountMatch[1]).toFixed(2) } : undefined;

  const out = await refundOrder(store, order, { amount });
  const reply = out.ok
    ? `Refunded **${out.order_ref}** · ${formatMoney(toCents(out.refunded), store.currency)}${out.full_refund ? "" : " (partial)"} via PayPal (refund ${out.refund_id}, ${out.status}).`
    : `Couldn't refund **${order.ref}**: ${errorText(out.error)}`;
  return { toolName: "create_refund", input: { order_ref: order.ref, ...(amount ? { amount } : {}) }, output: out, reply };
}

async function trackingCommand(store: Store, text: string): Promise<DirectResult | null> {
  const ref = text.match(ORDER_REF)?.[0];
  // Tracking number: the longest alphanumeric token (8+) that isn't the order ref.
  const tokens = (text.match(/\b[A-Z0-9]{8,35}\b/gi) ?? []).filter((t) => !/^OA-/i.test(t) && /\d/.test(t));
  const trackingNumber = tokens.sort((a, b) => b.length - a.length)[0];
  const carrier = text.match(CARRIERS)?.[0]?.replace(/\s+/g, "").toUpperCase();
  if (!trackingNumber) return null; // not clear enough: let the AI handle it

  // Order: OA ref, else a PayPal id that isn't the tracking number itself, else "most recent".
  const paypalId = (text.match(/\b[A-Z0-9]{17,20}\b/g) ?? []).find((t) => t !== trackingNumber);
  const id = ref ?? paypalId ?? (RECENT.test(text) ? "most recent paid order" : null);
  const order = ref || paypalId ? await resolveOrder(store, (ref ?? paypalId)!) : id ? await latestPaidOrder(store) : null;
  if (!id || !order) {
    return { toolName: "create_shipment_tracking", input: { tracking_number: trackingNumber }, output: { ok: false, error: id ? `No order ${id} in this store` : "Which order?" }, reply: id ? `I couldn't find **${id}** in this store.` : "Which order should get this tracking number? e.g. “… to OA-1001”." };
  }

  const out = await addTracking(store, order, { tracking_number: trackingNumber.toUpperCase(), carrier });
  const reply = out.ok
    ? `Added ${out.carrier ?? ""} tracking **${out.tracking_number}** to **${out.order_ref}** on PayPal.`.replace(/\s+/g, " ")
    : `Couldn't add tracking to **${order.ref}**: ${errorText(out.error)}`;
  return { toolName: "create_shipment_tracking", input: { order_ref: order.ref, tracking_number: trackingNumber, carrier }, output: out, reply };
}

async function invoiceCommand(store: Store, text: string): Promise<DirectResult | null> {
  // "Invoice buyer@example.com for 20 cotton stoles at $14 each"
  const m = text.match(/invoice\s+(\S+@\S+?)\s+for\s+(\d+)\s+(.+?)\s+(?:at|@)\s+\$?\s?(\d+(?:\.\d{1,2})?)(?:\s*(?:each|ea|apiece|per\s+\w+))?\s*[.!]?\s*$/i);
  if (!m) return null; // free-form invoice request: let the AI handle it
  const [, email, qty, rawName, price] = m;
  const name = rawName.trim().replace(/\b\w/g, (c) => c.toUpperCase());
  const input = { recipient_email: email, items: [{ name, quantity: Number(qty), unit_price: Number(price) }] };

  const out = await createAndSendInvoice(store, input);
  const reply = out.ok
    ? `Invoice **${out.invoice_id}** for ${formatMoney(toCents(out.total), store.currency)} sent to ${out.recipient}.`
    : `Couldn't send the invoice: ${errorText(out.error)}`;
  return { toolName: "create_and_send_invoice", input, output: out, reply };
}

async function statusCommand(store: Store, text: string): Promise<DirectResult | null> {
  const id = findOrderId(text);
  if (!id) return null;
  const order = await resolveOrder(store, id);
  if (!order) return { toolName: "lookup_order", input: { id }, output: { found: false, message: `No order ${id}` }, reply: `I couldn't find **${id}** in this store.` };
  const total = formatMoney(toCents(order.total), order.currency);
  const tracking = order.trackingNumber ? ` · ${order.carrier ?? "Tracking"} ${order.trackingNumber}` : "";
  return {
    toolName: "lookup_order",
    input: { order_ref: order.ref },
    output: { found: true, order: { ref: order.ref, status: order.status, total, capture_id: order.captureId } },
    reply: `**${order.ref}** · ${order.status} · ${total}${tracking}${order.buyerEmail ? ` · ${order.buyerEmail}` : ""}`,
  };
}

/** Returns a result if the message is a clear command; null means "ask the AI". */
export async function runDirectCommand(store: Store, text: string): Promise<DirectResult | null> {
  const t = text.trim();
  if (/^(please\s+)?(issue\s+an?\s+)?refund\b/i.test(t)) return refundCommand(store, t);
  if (/^(please\s+)?(add|attach|set)\s+(a\s+)?tracking\b|^tracking\b/i.test(t)) return trackingCommand(store, t);
  if (/^(please\s+)?(send\s+an?\s+)?invoice\b/i.test(t)) return invoiceCommand(store, t);
  if (/^(status|check|lookup|look\s+up|find|show)\b.*\b(order|OA-\d+)/i.test(t)) return statusCommand(store, t);
  return null;
}
