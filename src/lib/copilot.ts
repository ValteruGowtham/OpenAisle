import { jsonSchema, tool } from "ai";
import { PayPalAgentToolkit } from "@paypal/agent-toolkit/openai";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { getRecentOrders, getStoreStats, toDashboardOrder } from "@/lib/dashboard";
import { logEvent } from "@/lib/events";
import { getMissedDemand } from "@/lib/missed-demand";
import { formatMoney, fromCents, sumCents, toCents } from "@/lib/money";

/**
 * Merchant Copilot tools.
 *
 * PayPal actions are executed by the PayPal Agent Toolkit. Its `ai-sdk` export is built on
 * ai@4 + zod@3 (nested in its own node_modules) and isn't compatible with our ai@7 streamText,
 * so we use the toolkit's OpenAI-format export: `getTools()` gives the JSON schemas and
 * `handleToolCall()` performs the PayPal request. We bridge those into AI SDK tools here.
 * create_invoice's full schema is ~10k chars (too big for Groq's free tier), so the model sees a
 * slim schema and we map it to the toolkit's arguments.
 */

type Store = { id: string; slug: string; name: string; currency: string };

const TRANSACTION_SEARCH = process.env.PAYPAL_TRANSACTION_SEARCH === "true";

let toolkit: PayPalAgentToolkit | null = null;

function getToolkit(): PayPalAgentToolkit {
  if (toolkit) return toolkit;
  const clientId = process.env.PAYPAL_CLIENT_ID?.trim();
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) throw new Error("PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET are not set");
  toolkit = new PayPalAgentToolkit({
    clientId,
    clientSecret,
    configuration: {
      actions: {
        orders: { get: true },
        payments: { createRefund: true },
        invoices: { create: true, send: true },
        shipment: { create: true },
        ...(TRANSACTION_SEARCH ? { transactions: { list: true } } : {}),
      },
      context: { sandbox: process.env.PAYPAL_ENV !== "live" },
    },
  });
  return toolkit;
}

type ToolkitResult = { ok: boolean; data: Record<string, unknown> };

/** Run one PayPal Agent Toolkit tool by name and parse its JSON result. */
async function runToolkit(name: string, args: Record<string, unknown>): Promise<ToolkitResult> {
  const res = await getToolkit().handleToolCall({
    id: `call_${crypto.randomUUID()}`,
    type: "function",
    function: { name, arguments: JSON.stringify(args) },
  });
  const raw = typeof res.content === "string" ? res.content : JSON.stringify(res.content);
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw);
  } catch {
    data = { message: raw };
  }
  const failed =
    data.ok === false || "error" in data || (typeof data.status === "number" && data.status >= 400) || data.name === "UNPROCESSABLE_ENTITY";
  return { ok: !failed, data };
}

/** The toolkit's own description/schema for a tool (so descriptions stay the toolkit's). */
function toolkitSpec(name: string) {
  const t = getToolkit()
    .getTools()
    .find((x) => x.type === "function" && x.function.name === name);
  if (!t || t.type !== "function") throw new Error(`PayPal toolkit tool ${name} is not enabled`);
  return t.function;
}

/** First paragraph(s) of a toolkit description, trimmed for the free-tier token budget. */
function shortDescription(name: string, max = 420) {
  const d = (toolkitSpec(name).description ?? "").trim().replace(/\n{2,}/g, "\n");
  return d.length > max ? `${d.slice(0, max).replace(/\s+\S*$/, "")}…` : d;
}

async function orderByCapture(storeId: string, captureId: string) {
  return getDb().order.findFirst({ where: { storeId, captureId } });
}

async function copilotEvent(store: Store, summary: string, payload: Prisma.InputJsonObject = {}) {
  await logEvent({ storeId: store.id, type: "COPILOT_ACTION", channel: null, payload: { summary, ...payload } });
}

export function buildCopilotTools(store: Store) {
  const money = (cents: number) => formatMoney(cents, store.currency);

  const tools = {
    // ---------- Custom store tools ----------
    lookup_order: tool({
      description:
        "Look up this store's orders. With order_ref (e.g. OA-1001) returns that order's PayPal order id, capture id (needed for refunds and tracking), status, items, total and buyer. Without order_ref returns the 5 most recent orders, newest first.",
      inputSchema: z.object({ order_ref: z.string().max(32).optional() }),
      execute: async ({ order_ref }) => {
        const db = getDb();
        const mapOrder = (o: Awaited<ReturnType<typeof db.order.findFirst>>) =>
          o && { ...toDashboardOrder(o), paypal_order_id: o.paypalOrderId, capture_id: o.captureId };
        if (order_ref) {
          const o = await db.order.findFirst({ where: { storeId: store.id, ref: order_ref.trim().toUpperCase() } });
          await copilotEvent(store, `Copilot looked up order ${order_ref.toUpperCase()}`, { action: "lookup_order" });
          return o ? { found: true, order: mapOrder(o) } : { found: false, message: `No order ${order_ref}` };
        }
        const recent = await db.order.findMany({
          where: { storeId: store.id, NOT: { paypalOrderId: { startsWith: "pending-" } } },
          orderBy: { createdAt: "desc" },
          take: 5,
        });
        await copilotEvent(store, "Copilot listed recent orders", { action: "lookup_order" });
        return { found: recent.length > 0, orders: recent.map(mapOrder) };
      },
    }),

    get_store_stats: tool({
      description:
        "Store performance: agent sessions (24h), checkouts, paid orders, revenue captured and conversion (7 days), refunds, and missed searches.",
      inputSchema: z.object({}),
      execute: async () => {
        const [stats, recent] = await Promise.all([getStoreStats(store.id, store.currency), getRecentOrders(store.id, 5)]);
        await copilotEvent(store, "Copilot read store stats", { action: "get_store_stats" });
        return { ...stats, recent_orders: recent.map((o) => ({ ref: o.ref, status: o.status, total: o.total, channel: o.channel })) };
      },
    }),

    get_missed_demand: tool({
      description:
        "What AI shoppers searched for but couldn't find (last 7 days), clustered into up to 5 product opportunities with counts, example queries, a suggested product and price range.",
      inputSchema: z.object({}),
      execute: async () => {
        const md = await getMissedDemand(store.id);
        await copilotEvent(store, "Copilot reviewed missed demand", { action: "get_missed_demand" });
        return md;
      },
    }),

    // ---------- PayPal Agent Toolkit tools ----------
    get_order: tool({
      description: shortDescription("get_order"),
      inputSchema: jsonSchema<{ id: string }>(toolkitSpec("get_order").parameters as never),
      execute: async (args) => {
        const { ok, data } = await runToolkit("get_order", args);
        await copilotEvent(store, `Copilot fetched PayPal order ${args.id}`, { action: "get_order", ok });
        if (!ok) return { ok, error: data };
        const pu = (data.purchase_units as { reference_id?: string; amount?: unknown; payments?: { captures?: { id: string; status: string; amount: unknown }[] } }[] | undefined)?.[0];
        return {
          ok,
          id: data.id,
          status: data.status,
          reference: pu?.reference_id,
          amount: pu?.amount,
          captures: pu?.payments?.captures?.map((c) => ({ id: c.id, status: c.status, amount: c.amount })),
          payer: (data.payment_source as { paypal?: { email_address?: string } } | undefined)?.paypal?.email_address,
        };
      },
    }),

    create_refund: tool({
      description: `${shortDescription("create_refund", 380)}\nUse lookup_order first to get the capture_id. Omit amount for a full refund.`,
      inputSchema: jsonSchema<{
        capture_id: string;
        amount?: { currency_code: string; value: string };
        note_to_payer?: string;
      }>(toolkitSpec("create_refund").parameters as never),
      execute: async (args) => {
        const order = await orderByCapture(store.id, args.capture_id);
        if (!order) return { ok: false, error: "That capture id doesn't belong to an order in this store." };
        if (order.status === "REFUNDED") return { ok: false, error: `${order.ref} is already refunded.` };

        const { ok, data } = await runToolkit("create_refund", args);
        if (!ok) {
          await copilotEvent(store, `Copilot refund failed for ${order.ref}`, { action: "create_refund", ok: false });
          return { ok, order_ref: order.ref, error: data };
        }

        const totalCents = toCents(order.total);
        const refundedCents = args.amount?.value ? toCents(args.amount.value) : totalCents;
        const full = refundedCents >= totalCents;
        await getDb().order.update({
          where: { id: order.id },
          data: full ? { status: "REFUNDED" } : {},
        });
        await copilotEvent(store, `Copilot refunded ${order.ref} · ${money(refundedCents)}${full ? "" : " (partial)"}`, {
          action: "create_refund",
          order_ref: order.ref,
          amount: fromCents(refundedCents),
          refund_id: String(data.id ?? ""),
          refund_status: String(data.status ?? ""),
        });
        return { ok, order_ref: order.ref, refund_id: data.id, status: data.status, refunded: fromCents(refundedCents), full_refund: full };
      },
    }),

    create_shipment_tracking: tool({
      description: `${shortDescription("create_shipment_tracking", 300)}\nUse lookup_order first: transaction_id is the order's capture_id and order_id is its paypal_order_id. Carrier examples: UPS, FEDEX, USPS, DHL.`,
      inputSchema: jsonSchema<{
        order_id?: string;
        tracking_number: string;
        transaction_id: string;
        status?: string;
        carrier?: string;
      }>(toolkitSpec("create_shipment_tracking").parameters as never),
      execute: async (args) => {
        const order = await orderByCapture(store.id, args.transaction_id);
        if (!order) return { ok: false, error: "That transaction id doesn't belong to a paid order in this store." };

        const { ok, data } = await runToolkit("create_shipment_tracking", {
          ...args,
          order_id: args.order_id ?? order.paypalOrderId,
          carrier: args.carrier?.toUpperCase(),
          status: args.status ?? "SHIPPED",
        });
        if (!ok) {
          await copilotEvent(store, `Copilot tracking failed for ${order.ref}`, { action: "create_shipment_tracking", ok: false });
          return { ok, order_ref: order.ref, error: data };
        }

        const carrier = args.carrier?.toUpperCase() ?? null;
        await getDb().order.update({
          where: { id: order.id },
          data: { trackingNumber: args.tracking_number, carrier },
        });
        await copilotEvent(store, `Copilot added ${carrier ?? ""} tracking ${args.tracking_number} to ${order.ref}`.replace(/\s+/g, " "), {
          action: "create_shipment_tracking",
          order_ref: order.ref,
          tracking_number: args.tracking_number,
          carrier,
        });
        return { ok, order_ref: order.ref, tracking_number: args.tracking_number, carrier, status: args.status ?? "SHIPPED" };
      },
    }),

    create_and_send_invoice: tool({
      description:
        "Create a PayPal invoice for a customer and email it to them (PayPal create_invoice + send_invoice). Give the recipient email and line items (name, quantity, unit price). The buyer pays the invoice on PayPal.",
      inputSchema: z.object({
        recipient_email: z.string().email(),
        items: z
          .array(
            z.object({
              name: z.string().min(1).max(200),
              quantity: z.number().int().min(1).max(10000),
              unit_price: z.number().positive().max(100000).describe(`Unit price in ${store.currency}.`),
            }),
          )
          .min(1)
          .max(20),
        note: z.string().max(500).optional(),
      }),
      execute: async ({ recipient_email, items, note }) => {
        const lines = items.map((i) => ({ ...i, unitCents: toCents(i.unit_price) }));
        const totalCents = sumCents(lines.map((l) => l.unitCents * l.quantity));

        const created = await runToolkit("create_invoice", {
          currency_code: store.currency,
          invoicer_business_name: store.name,
          note: note ?? `Thank you for shopping with ${store.name}.`,
          primary_recipients: [{ billing_info: { email_address: recipient_email } }],
          items: lines.map((l) => ({
            name: l.name,
            quantity: String(l.quantity),
            unit_amount: { currency_code: store.currency, value: fromCents(l.unitCents) },
          })),
        });
        if (!created.ok) {
          await copilotEvent(store, `Copilot invoice failed for ${recipient_email}`, { action: "create_invoice", ok: false });
          return { ok: false, step: "create_invoice", error: created.data };
        }

        const href = String(created.data.href ?? "");
        const invoiceId = String(created.data.id ?? href.split("/").pop() ?? "");
        const sent = await runToolkit("send_invoice", { invoice_id: invoiceId, send_to_recipient: true });

        await copilotEvent(
          store,
          sent.ok
            ? `Copilot invoiced ${recipient_email} · ${money(totalCents)}`
            : `Copilot created invoice for ${recipient_email} (sending failed)`,
          { action: "create_and_send_invoice", invoice_id: invoiceId, total: fromCents(totalCents), recipient: recipient_email, sent: sent.ok },
        );
        return {
          ok: sent.ok,
          invoice_id: invoiceId,
          total: fromCents(totalCents),
          currency: store.currency,
          recipient: recipient_email,
          sent: sent.ok,
          ...(sent.ok ? {} : { error: sent.data }),
        };
      },
    }),
  };

  if (!TRANSACTION_SEARCH) return tools;

  return {
    ...tools,
    list_transactions: tool({
      description: shortDescription("list_transactions", 300),
      inputSchema: z.object({
        start_date: z.string().optional().describe("ISO8601 with seconds, e.g. 2026-11-01T00:00:00Z"),
        end_date: z.string().optional().describe("ISO8601 with seconds; max 31 days after start_date"),
        transaction_id: z.string().optional(),
      }),
      execute: async (args) => {
        const { ok, data } = await runToolkit("list_transactions", args);
        await copilotEvent(store, "Copilot listed PayPal transactions", { action: "list_transactions", ok });
        return { ok, ...(ok ? { data } : { error: data }) };
      },
    }),
  };
}

export type CopilotTools = ReturnType<typeof buildCopilotTools>;
