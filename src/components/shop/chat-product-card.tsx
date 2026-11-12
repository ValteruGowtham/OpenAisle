import type { CompactProduct } from "@/lib/store-tools";
import { formatMoney, toCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { StockBadge } from "./product-card";
import { ProductImage } from "./product-image";

export function ChatProductCard({ product, wide }: { product: CompactProduct; wide?: boolean }) {
  return (
    <div
      className={cn(
        "flex shrink-0 overflow-hidden rounded-xl border bg-card",
        wide ? "w-full flex-row" : "w-36 flex-col",
      )}
    >
      <ProductImage
        src={product.image_url}
        alt={product.title}
        sku={product.sku}
        className={wide ? "size-24 shrink-0" : "aspect-square w-full"}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1 p-2.5">
        <span className="line-clamp-2 text-xs font-medium leading-snug">{product.title}</span>
        <span className="text-xs font-semibold tabular-nums">
          {formatMoney(toCents(product.price), product.currency)}
        </span>
        {wide && <span className="line-clamp-2 text-[11px] text-muted-foreground">{product.summary}</span>}
        <div className="mt-auto flex items-center justify-between gap-1 pt-1">
          <span className="truncate font-mono text-[10px] text-muted-foreground">{product.sku}</span>
          <StockBadge stock={product.stock} className="h-4 px-1.5 text-[10px]" />
        </div>
      </div>
    </div>
  );
}
