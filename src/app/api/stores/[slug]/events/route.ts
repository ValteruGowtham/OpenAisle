import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getFeed, getRecentOrders, getStoreStats } from "@/lib/dashboard";

/**
 * Live feed polling (every 3s from the dashboard).
 * ?after=<ISO time> returns only newer events; stats and orders are always fresh.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await getDb().store.findUnique({ where: { slug }, select: { id: true, currency: true } });
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });

  const afterParam = new URL(req.url).searchParams.get("after");
  const after = afterParam && !Number.isNaN(Date.parse(afterParam)) ? new Date(afterParam) : undefined;

  const [events, stats, orders] = await Promise.all([
    getFeed(store.id, store.currency, after),
    getStoreStats(store.id, store.currency),
    getRecentOrders(store.id),
  ]);

  return NextResponse.json(
    { events, stats, orders, serverTime: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
