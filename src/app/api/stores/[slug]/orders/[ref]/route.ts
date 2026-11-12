import { NextResponse } from "next/server";
import { getOrderStatus, StoreNotFoundError } from "@/lib/store-tools";

/** Lightweight status endpoint for the checkout card's polling (not logged to the feed). */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string; ref: string }> },
) {
  const { slug, ref } = await params;
  try {
    const status = await getOrderStatus(slug, { order_ref: ref }, { channel: "WEB_AGENT", log: false });
    return NextResponse.json(status, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof StoreNotFoundError) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }
    throw err;
  }
}
