import { PrismaPg } from "@prisma/adapter-pg";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

/**
 * Prisma pg adapter for DATABASE_URL. Remote hosts (e.g. Render Postgres) require TLS, which
 * node-postgres does not enable by default, so turn it on unless the URL is local or sets sslmode.
 */
export function createPgAdapter(connectionString: string): PrismaPg {
  const url = new URL(connectionString);
  const isLocal = LOCAL_HOSTS.has(url.hostname.replace(/^\[|\]$/g, ""));
  const hasSslMode = url.searchParams.has("sslmode");
  return new PrismaPg({
    connectionString,
    ...(isLocal || hasSslMode ? {} : { ssl: { rejectUnauthorized: true } }),
  });
}
