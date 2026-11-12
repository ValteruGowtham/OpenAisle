import { getDb } from "@/lib/db";
import { formatMoney, toCents } from "@/lib/money";
import { appUrl, mcpUrl, storeUrl } from "@/lib/urls";

/** Agent discovery text (llms.txt convention): what the store sells and how an AI agent can buy. */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await getDb().store.findUnique({
    where: { slug },
    include: { products: { orderBy: { title: "asc" } } },
  });
  if (!store) return new Response("Store not found\n", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });

  const base = appUrl(req);
  const money = (v: { toString(): string }) => formatMoney(toCents(v), store.currency);
  const inStock = store.products.filter((p) => p.stock > 0).length;

  const lines = [
    `# ${store.name}`,
    "",
    store.tagline ? `> ${store.tagline}` : null,
    store.tagline ? "" : null,
    store.description,
    store.description ? "" : null,
    `Storefront: ${storeUrl(base, store.slug)}`,
    `Currency: ${store.currency}. Checkout: PayPal (the buyer approves every payment on PayPal).`,
    "",
    "## For AI agents",
    "",
    `This store has a remote MCP server (Streamable HTTP, no auth): ${mcpUrl(base, store.slug)}`,
    "",
    "Tools:",
    "- search_products(query, max_price?, limit?): find products; returns sku, price, stock",
    "- get_product(sku): full details, attributes, shipping and return policy",
    "- create_checkout(items[{sku, quantity}], buyer_note?): creates a PayPal order and returns approve_url for the buyer",
    "- get_order_status(order_ref): CREATED, COMPLETED, REFUNDED or CANCELLED, plus tracking",
    "- get_store_info(): policies, currency and the agent order limit",
    "",
    "Rules: prices and totals are computed by the store, never by the agent. Confirm items and total with the user before create_checkout.",
    `Agent checkouts are limited to ${money(store.maxOrderValue)} per order.`,
    "",
    "## Policies",
    "",
    store.shippingPolicy ? `- Shipping: ${store.shippingPolicy}` : null,
    store.returnPolicy ? `- Returns: ${store.returnPolicy}` : null,
    "",
    `## Products (${store.products.length}, ${inStock} in stock)`,
    "",
    ...store.products.map((p) => {
      const stock = p.stock <= 0 ? "sold out" : `${p.stock} in stock`;
      return `- ${p.sku}: ${p.title} | ${money(p.price)} | ${stock}${p.agentSummary ? ` | ${p.agentSummary}` : ""}`;
    }),
    "",
  ].filter((l): l is string => l !== null);

  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=60" },
  });
}
