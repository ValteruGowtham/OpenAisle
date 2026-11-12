import type { AgentEvent, Order } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { formatMoney, fromCents, sumCents, toCents } from "@/lib/money";
import type { CheckoutLine } from "@/lib/store-tools";

/** Shared read models for the merchant dashboard (KPIs, live feed, orders). */

const DAY_MS = 24 * 60 * 60 * 1000;
const SESSION_GAP_MS = 30 * 60 * 1000;

export type FeedEvent = {
  id: string;
  type: AgentEvent["type"];
  channel: AgentEvent["channel"];
  client: string | null;
  summary: string;
  createdAt: string;
};

export type DashboardOrder = {
  id: string;
  ref: string;
  items: CheckoutLine[];
  itemCount: number;
  total: string;
  currency: string;
  status: Order["status"];
  channel: Order["channel"];
  agentClient: string | null;
  buyerEmail: string | null;
  trackingNumber: string | null;
  carrier: string | null;
  createdAt: string;
};

export type StoreStats = {
  sessions24h: number;
  checkouts7d: number;
  paidOrders7d: number;
  revenue7d: string;
  revenue7dLabel: string;
  conversionPct: number;
  refunds7d: number;
  missedSearches7d: number;
};

type Payload = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);

/** One-line, human summary of an agent event for the live feed. */
export function summarizeEvent(e: Pick<AgentEvent, "type" | "query" | "resultCount" | "payload">, currency = "USD"): string {
  const p = (e.payload ?? {}) as Payload;
  const money = (v: unknown) => (str(v) ? formatMoney(toCents(String(v)), currency) : "");
  switch (e.type) {
    case "SEARCH": {
      const n = e.resultCount ?? 0;
      return `Searched "${e.query ?? ""}" · ${n === 0 ? "no results" : `${n} result${n === 1 ? "" : "s"}`}`;
    }
    case "VIEW": {
      if (p.tool === "get_product") return `Viewed product ${str(p.sku) ?? ""}`.trim();
      if (p.tool === "get_store_info") return "Read store info & policies";
      if (p.tool === "get_order_status") return `Checked order status ${str(p.order_ref) ?? ""}`.trim();
      if (p.tool === "create_checkout") return `Previewed checkout · ${money(p.total)} (awaiting buyer confirmation)`;
      return "Viewed store data";
    }
    case "CHECKOUT_CREATED":
      return `Created PayPal checkout ${str(p.order_ref) ?? ""} · ${money(p.total)}`;
    case "PAYMENT_CAPTURED":
      return `Payment captured ${str(p.order_ref) ?? ""} · ${money(p.total)}`;
    case "POLICY_BLOCKED":
      return `Checkout blocked: ${str(p.reason) ?? "store policy"}`;
    case "REFUNDED":
      return `Refunded ${str(p.order_ref) ?? ""} · ${money(p.amount)}`;
    case "COPILOT_ACTION":
      return str(p.summary) ?? "Copilot action";
    default:
      return e.type;
  }
}

export function toFeedEvent(e: AgentEvent, currency = "USD"): FeedEvent {
  const p = (e.payload ?? {}) as Payload;
  return {
    id: e.id,
    type: e.type,
    channel: e.channel,
    client: e.type === "COPILOT_ACTION" ? "copilot" : (str(p.agentClient) ?? null),
    summary: summarizeEvent(e, currency),
    createdAt: e.createdAt.toISOString(),
  };
}

export function toDashboardOrder(o: Order): DashboardOrder {
  const items = (o.items ?? []) as CheckoutLine[];
  return {
    id: o.id,
    ref: o.ref,
    items,
    itemCount: items.reduce((n, i) => n + i.quantity, 0),
    total: fromCents(toCents(o.total)),
    currency: o.currency,
    status: o.status,
    channel: o.channel,
    agentClient: o.agentClient,
    buyerEmail: o.buyerEmail,
    trackingNumber: o.trackingNumber,
    carrier: o.carrier,
    createdAt: o.createdAt.toISOString(),
  };
}

/**
 * Agent sessions = bursts of agent activity. Web chat events carry the chat session id; MCP is
 * stateless, so its events are grouped per client and split after 30 minutes of inactivity.
 */
function countSessions(events: Pick<AgentEvent, "channel" | "payload" | "createdAt">[]): number {
  const lastSeen = new Map<string, number>();
  let sessions = 0;
  for (const e of [...events].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    const p = (e.payload ?? {}) as Payload;
    const key = str(p.session) ?? `${e.channel}:${str(p.agentClient) ?? "unknown"}`;
    const t = e.createdAt.getTime();
    const prev = lastSeen.get(key);
    if (prev === undefined || t - prev > SESSION_GAP_MS) sessions++;
    lastSeen.set(key, t);
  }
  return sessions;
}

export async function getStoreStats(storeId: string, currency = "USD"): Promise<StoreStats> {
  const db = getDb();
  const now = Date.now();
  const since24h = new Date(now - DAY_MS);
  const since7d = new Date(now - 7 * DAY_MS);

  const [agentEvents24h, checkouts7d, paid7d, refunds7d, missed7d] = await Promise.all([
    db.agentEvent.findMany({
      where: { storeId, createdAt: { gte: since24h }, channel: { not: null }, type: { not: "COPILOT_ACTION" } },
      select: { channel: true, payload: true, createdAt: true },
    }),
    db.order.count({ where: { storeId, createdAt: { gte: since7d } } }),
    db.order.findMany({
      where: { storeId, createdAt: { gte: since7d }, status: { in: ["COMPLETED", "REFUNDED"] } },
      select: { total: true, status: true },
    }),
    db.order.count({ where: { storeId, createdAt: { gte: since7d }, status: "REFUNDED" } }),
    db.agentEvent.count({ where: { storeId, type: "SEARCH", resultCount: { lte: 1 }, createdAt: { gte: since7d } } }),
  ]);

  // Revenue = captured and not refunded.
  const revenueCents = sumCents(paid7d.filter((o) => o.status === "COMPLETED").map((o) => toCents(o.total)));
  return {
    sessions24h: countSessions(agentEvents24h),
    checkouts7d,
    paidOrders7d: paid7d.length,
    revenue7d: fromCents(revenueCents),
    revenue7dLabel: formatMoney(revenueCents, currency),
    conversionPct: checkouts7d === 0 ? 0 : Math.round((paid7d.length / checkouts7d) * 100),
    refunds7d,
    missedSearches7d: missed7d,
  };
}

export async function getRecentOrders(storeId: string, take = 12): Promise<DashboardOrder[]> {
  const orders = await getDb().order.findMany({
    where: { storeId, NOT: { paypalOrderId: { startsWith: "pending-" } } },
    orderBy: { createdAt: "desc" },
    take,
  });
  return orders.map(toDashboardOrder);
}

export async function getFeed(storeId: string, currency: string, after?: Date, take = 40): Promise<FeedEvent[]> {
  const events = await getDb().agentEvent.findMany({
    where: { storeId, ...(after ? { createdAt: { gt: after } } : {}) },
    orderBy: { createdAt: "desc" },
    take,
  });
  return events.map((e) => toFeedEvent(e, currency));
}
