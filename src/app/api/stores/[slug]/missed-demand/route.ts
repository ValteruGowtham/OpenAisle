import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getMissedDemand } from "@/lib/missed-demand";

export const maxDuration = 60;

/** Missed Demand clusters (cached 60s). ?refresh=1 bypasses the cache. */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await getDb().store.findUnique({ where: { slug }, select: { id: true } });
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });

  const force = new URL(req.url).searchParams.get("refresh") === "1";
  const data = await getMissedDemand(store.id, { force });
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
