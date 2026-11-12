import { Badge } from "@/components/ui/badge";
import { formatMoney, toCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { ProductImage } from "./product-image";

export type ProductCardData = {
  sku: string;
  title: string;
  price: string;
  currency: string;
  stock: number;
  imageUrl: string | null;
  tags: string[];
};

export function StockBadge({ stock, className }: { stock: number; className?: string }) {
  if (stock <= 0) return <Badge variant="outline" className={className}>Sold out</Badge>;
  if (stock <= 3)
    return (
      <Badge className={cn("border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400", className)}>
        Only {stock} left
      </Badge>
    );
  return (
    <Badge className={cn("border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-400", className)}>
      In stock
    </Badge>
  );
}

export function ProductCard({ product }: { product: ProductCardData }) {
  return (
    <div className="group flex flex-col overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-md">
      <ProductImage src={product.imageUrl} alt={product.title} sku={product.sku} className="aspect-square" />
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="line-clamp-2 text-sm font-medium leading-snug">{product.title}</h3>
          <span className="shrink-0 text-sm font-semibold tabular-nums">
            {formatMoney(toCents(product.price), product.currency)}
          </span>
        </div>
        <div className="mt-auto flex items-center justify-between gap-2">
          <span className="font-mono text-[11px] text-muted-foreground">{product.sku}</span>
          <StockBadge stock={product.stock} />
        </div>
      </div>
    </div>
  );
}
