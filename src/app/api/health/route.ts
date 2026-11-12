import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Render health check. Always 200 while the app is up (a DB hiccup shouldn't fail deploys);
 * the body reports DB reachability and the deployed commit.
 */
export async function GET() {
  let db: "ok" | "error" = "ok";
  try {
    await getDb().$queryRaw`SELECT 1`;
  } catch {
    db = "error";
  }
  return NextResponse.json(
    { ok: true, service: "openaisle", db, commit: process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? null },
    { headers: { "Cache-Control": "no-store" } },
  );
}
