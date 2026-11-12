let warned = false;

/**
 * Public base URL used for every absolute link we hand out (PayPal return/cancel URLs, MCP URLs,
 * image URLs for agents, llms.txt). Order: APP_URL, then Render's auto-set RENDER_EXTERNAL_URL,
 * then the request's own origin, then localhost for local dev.
 */
export function appUrl(req?: Request): string {
  const env = (process.env.APP_URL || process.env.RENDER_EXTERNAL_URL)?.trim().replace(/\/+$/, "");
  if (env) return env;
  if (process.env.NODE_ENV === "production" && !warned) {
    warned = true;
    console.warn("[urls] APP_URL is not set; falling back to the request origin/localhost. Set APP_URL to the public https URL.");
  }
  if (req) return new URL(req.url).origin;
  return "http://localhost:3000";
}

export const mcpUrl = (base: string, slug: string) => `${base}/api/mcp/${slug}`;
export const storeUrl = (base: string, slug: string) => `${base}/s/${slug}`;
