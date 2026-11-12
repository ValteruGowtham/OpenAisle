import { generateText, Output } from "ai";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { withFallback } from "@/lib/llm";
import { formatMoney, toCents } from "@/lib/money";

/**
 * Missed Demand: agent searches that found (almost) nothing, clustered by the LLM into product
 * opportunities. Counts and example queries are computed in code from the cluster membership the
 * LLM returns, so the numbers are always exact.
 */

export type Opportunity = {
  title: string;
  example_queries: string[];
  count: number;
  suggested_product: string;
  suggested_price_range: string;
};

export type MissedDemand = {
  opportunities: Opportunity[];
  totalSearches: number;
  uniqueQueries: number;
  generatedAt: string;
  source: "ai" | "heuristic" | "empty";
};

const CACHE_MS = 60_000;
const cache = new Map<string, { at: number; data: MissedDemand }>();

const ClusterSchema = z.object({
  opportunities: z
    .array(
      z.object({
        title: z.string().describe("Short opportunity name, e.g. 'Men's kurtas'."),
        query_ids: z.array(z.number().int()).describe("Ids of the queries (from the numbered list) in this cluster."),
        suggested_product: z.string().describe("One concrete product the store could add that fits its catalog."),
        suggested_price_range: z.string().describe("USD price range like '$45–$70', consistent with the store's prices."),
      }),
    )
    .describe("Up to 5 clusters, biggest demand first. Only real buying intent; skip noise."),
});

const normalize = (q: string) => q.toLowerCase().replace(/\s+/g, " ").trim();

function heuristic(groups: { query: string; count: number }[]): Opportunity[] {
  return groups.slice(0, 5).map((g) => ({
    title: g.query.replace(/\b\w/g, (c) => c.toUpperCase()),
    example_queries: [g.query],
    count: g.count,
    suggested_product: g.query.replace(/\b\w/g, (c) => c.toUpperCase()),
    suggested_price_range: "Set from similar items",
  }));
}

export async function getMissedDemand(storeId: string, opts: { force?: boolean } = {}): Promise<MissedDemand> {
  const hit = cache.get(storeId);
  if (!opts.force && hit && Date.now() - hit.at < CACHE_MS) return hit.data;

  const db = getDb();
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [events, store] = await Promise.all([
    db.agentEvent.findMany({
      where: { storeId, type: "SEARCH", resultCount: { lte: 1 }, createdAt: { gte: since }, query: { not: null } },
      select: { query: true },
      orderBy: { createdAt: "desc" },
      take: 300,
    }),
    db.store.findUniqueOrThrow({
      where: { id: storeId },
      select: { name: true, currency: true, products: { select: { title: true, price: true }, take: 50 } },
    }),
  ]);

  // Unique queries with occurrence counts, most frequent first.
  const counts = new Map<string, number>();
  for (const e of events) {
    const q = normalize(e.query ?? "");
    if (q) counts.set(q, (counts.get(q) ?? 0) + 1);
  }
  const groups = [...counts.entries()].map(([query, count]) => ({ query, count })).sort((a, b) => b.count - a.count);

  const base = { totalSearches: events.length, uniqueQueries: groups.length, generatedAt: new Date().toISOString() };
  if (groups.length === 0) {
    const data: MissedDemand = { ...base, opportunities: [], source: "empty" };
    cache.set(storeId, { at: Date.now(), data });
    return data;
  }

  let data: MissedDemand;
  try {
    const prices = store.products.map((p) => toCents(p.price)).sort((a, b) => a - b);
    const priceContext = prices.length
      ? `Current prices range ${formatMoney(prices[0], store.currency)}–${formatMoney(prices[prices.length - 1], store.currency)}.`
      : "";
    const catalog = store.products.slice(0, 20).map((p) => p.title).join("; ");
    const numbered = groups.slice(0, 80).map((g, i) => `${i}. ${g.query} (x${g.count})`).join("\n");

    const { output } = await withFallback((model) =>
      generateText({
        model,
        system:
          "You analyze searches by AI shopping agents that found nothing in a store, and group them into product opportunities for the merchant. Be concrete and commercially sensible.",
        prompt: `Store: ${store.name}. ${priceContext}\nCatalog sample: ${catalog}\n\nUnmatched searches (id. query (xcount)):\n${numbered}\n\nGroup them into at most 5 opportunities.`,
        output: Output.object({ schema: ClusterSchema }),
        maxOutputTokens: 2000,
        providerOptions: { groq: { reasoningEffort: "low" } },
        abortSignal: AbortSignal.timeout(25_000),
      }),
    );

    const used = new Set<number>();
    const opportunities = output.opportunities
      .map((o) => {
        const ids = [...new Set(o.query_ids)].filter((i) => i >= 0 && i < groups.length && !used.has(i));
        ids.forEach((i) => used.add(i));
        const members = ids.map((i) => groups[i]).sort((a, b) => b.count - a.count);
        return {
          title: o.title.trim(),
          example_queries: members.slice(0, 4).map((m) => m.query),
          count: members.reduce((n, m) => n + m.count, 0),
          suggested_product: o.suggested_product.trim(),
          suggested_price_range: o.suggested_price_range.trim(),
        };
      })
      .filter((o) => o.count > 0 && o.title)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    data = { ...base, opportunities, source: "ai" };
  } catch (err) {
    console.error("[missed-demand] clustering failed, using heuristic", err);
    data = { ...base, opportunities: heuristic(groups), source: "heuristic" };
  }

  cache.set(storeId, { at: Date.now(), data });
  return data;
}
