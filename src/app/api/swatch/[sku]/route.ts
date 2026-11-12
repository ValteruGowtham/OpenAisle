import { renderSwatchSvg, type SwatchKind } from "@/lib/swatch";

const KINDS = new Set<SwatchKind>(["stripe", "ikat", "border", "dots"]);

export async function GET(req: Request, { params }: { params: Promise<{ sku: string }> }) {
  const { sku } = await params;
  const url = new URL(req.url);
  const k = url.searchParams.get("k") as SwatchKind | null;
  const svg = renderSwatchSvg(sku.slice(0, 64), k && KINDS.has(k) ? k : "stripe", url.searchParams.get("c") ?? "");
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
