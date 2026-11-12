import { createMcpHandler } from "mcp-handler";
import type { McpServer } from "@modelcontextprotocol/server";
import { getDb } from "@/lib/db";
import {
  createCheckout,
  createCheckoutInput,
  getOrderStatus,
  getOrderStatusInput,
  getProduct,
  getProductInput,
  getStoreInfo,
  getStoreInfoInput,
  searchProducts,
  searchProductsInput,
  StoreNotFoundError,
  type ToolCtx,
} from "@/lib/store-tools";

/**
 * Remote MCP server, one per store: /api/mcp/{slug}. Streamable HTTP, stateless.
 * mcp-handler returns a plain (Request) => Response and leaves routing to us, so the [slug]
 * segment comes straight from Next's params and is closed over when tools are registered.
 */

export const maxDuration = 60;

type Store = { slug: string; name: string; currency: string; tagline: string | null };

// Written for AI agents: when to call, what comes back, and the rules.
const DESCRIPTIONS = {
  search_products: (s: Store) =>
    `Search ${s.name}'s catalog. Use this first whenever the user wants to find or browse products. ` +
    `Returns up to 8 products with sku, title, unit price (${s.currency}, 2-decimal string), stock, in_stock, image_url and a one-line summary. ` +
    "Pass max_price to filter by unit price. An empty result means the store does not carry it: say so, do not suggest products that were not returned.",
  get_product: (s: Store) =>
    `Get full details for one ${s.name} product by sku (from search_products): description, attributes (material, color, size, origin, care), tags, stock, plus the store's shipping and return policy.`,
  create_checkout: (s: Store) =>
    `Create a PayPal checkout at ${s.name} for one or more items (sku + quantity). ` +
    "Prices, totals and currency are always computed by the store from its database; never pass prices. " +
    "Only call after the user has confirmed the exact items, quantities and total. " +
    "On success returns order_ref, itemized lines, total and approve_url: give the user the approve_url to review and pay on PayPal. You cannot take payment yourself; the order is paid only after the user approves on PayPal. " +
    "If ok is false, explain the reason to the user (e.g. out of stock, over the order limit).",
  get_order_status: (s: Store) =>
    `Check a ${s.name} order by its reference (e.g. OA-1001). Status is CREATED (awaiting PayPal approval), COMPLETED (paid), REFUNDED or CANCELLED; includes items, total and tracking when shipped.`,
  get_store_info: (s: Store) =>
    `Get ${s.name}'s store details: description, currency, shipping policy, return policy, the maximum order value allowed for agent checkouts, and product count. Use this to answer policy questions.`,
} as const;

/** Best-effort MCP client name for the activity feed. */
function clientName(server: McpServer, req: Request | undefined): string {
  // 2026-07-28 requests carry clientInfo per request (the SDK backfills this accessor from the
  // envelope). Stateless 2025-era tools/call requests don't (initialize was a separate request),
  // so fall back to the User-Agent.
  const info = server.server.getClientVersion();
  if (info?.name) return info.name.slice(0, 64);
  const ua = req?.headers.get("user-agent")?.trim();
  if (ua) return ua.split(/[\s/]/)[0].slice(0, 64) || "mcp-client";
  return "mcp-client";
}

function asResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function asError(err: unknown) {
  console.error("[mcp] tool error", err);
  const message =
    err instanceof StoreNotFoundError ? err.message : "The store couldn't complete that request. Please try again.";
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

function registerStoreTools(server: McpServer, store: Store) {
  const ctxFor = (req: Request | undefined): ToolCtx => ({ channel: "MCP", agentClient: clientName(server, req) });
  const run = async (fn: () => Promise<unknown>) => {
    try {
      return asResult(await fn());
    } catch (err) {
      return asError(err);
    }
  };

  server.registerTool(
    "search_products",
    {
      title: "Search products",
      description: DESCRIPTIONS.search_products(store),
      inputSchema: searchProductsInput,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (input, ctx) => run(() => searchProducts(store.slug, input, ctxFor(ctx.http?.req))),
  );

  server.registerTool(
    "get_product",
    {
      title: "Get product details",
      description: DESCRIPTIONS.get_product(store),
      inputSchema: getProductInput,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (input, ctx) => run(() => getProduct(store.slug, input, ctxFor(ctx.http?.req))),
  );

  server.registerTool(
    "create_checkout",
    {
      title: "Create PayPal checkout",
      description: DESCRIPTIONS.create_checkout(store),
      inputSchema: createCheckoutInput,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    (input, ctx) => run(() => createCheckout(store.slug, input, ctxFor(ctx.http?.req))),
  );

  server.registerTool(
    "get_order_status",
    {
      title: "Get order status",
      description: DESCRIPTIONS.get_order_status(store),
      inputSchema: getOrderStatusInput,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (input, ctx) => run(() => getOrderStatus(store.slug, input, ctxFor(ctx.http?.req))),
  );

  server.registerTool(
    "get_store_info",
    {
      title: "Get store info",
      description: DESCRIPTIONS.get_store_info(store),
      inputSchema: getStoreInfoInput,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (_input, ctx) => run(() => getStoreInfo(store.slug, ctxFor(ctx.http?.req))),
  );
}

async function handle(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await getDb().store.findUnique({
    where: { slug },
    select: { slug: true, name: true, currency: true, tagline: true },
  });
  if (!store) {
    return Response.json(
      { jsonrpc: "2.0", error: { code: -32001, message: `Store "${slug}" not found` }, id: null },
      { status: 404 },
    );
  }

  const handler = createMcpHandler((server) => registerStoreTools(server, store), {
    serverInfo: { name: `openaisle-${store.slug}`, version: "1.0.0" },
    instructions:
      `You are connected to ${store.name}${store.tagline ? ` (${store.tagline})` : ""} via OpenAisle. ` +
      `Prices are in ${store.currency}. Search before recommending, confirm items and total with the user before create_checkout, ` +
      "and send the user the approve_url to pay on PayPal.",
  });
  return handler(req);
}

export { handle as GET, handle as POST, handle as DELETE };
