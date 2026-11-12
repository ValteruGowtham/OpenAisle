/** Public base URL: APP_URL when set (production), else the request's own origin. */
export function appUrl(req?: Request): string {
  const env = process.env.APP_URL?.replace(/\/+$/, "");
  if (env) return env;
  if (req) return new URL(req.url).origin;
  return "http://localhost:3000";
}

export const mcpUrl = (base: string, slug: string) => `${base}/api/mcp/${slug}`;
export const storeUrl = (base: string, slug: string) => `${base}/s/${slug}`;
