import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Bot, ShieldCheck, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ProductCard } from "@/components/shop/product-card";
import { ShopChatPanel } from "@/components/shop/shop-chat-panel";
import { CheckoutCancelledToast } from "@/components/shop/checkout-cancelled-toast";
import { getDb } from "@/lib/db";
import { fromCents, toCents } from "@/lib/money";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ checkout?: string }>;
};

async function loadStore(slug: string) {
  return getDb().store.findUnique({
    where: { slug },
    include: { products: { orderBy: [{ stock: "desc" }, { createdAt: "asc" }] } },
  });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const store = await getDb().store.findUnique({ where: { slug }, select: { name: true, tagline: true } });
  return store ? { title: `${store.name} · OpenAisle`, description: store.tagline ?? undefined } : {};
}

export default async function StorePage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { checkout } = await searchParams;
  const store = await loadStore(slug);
  if (!store) notFound();

  const products = store.products.map((p) => ({
    sku: p.sku,
    title: p.title,
    price: fromCents(toCents(p.price)),
    currency: store.currency,
    stock: p.stock,
    imageUrl: p.imageUrl,
    tags: p.tags,
  }));

  return (
    <div className="flex flex-1 flex-col">
      {checkout === "cancelled" && <CheckoutCancelledToast />}
      <header className="border-b">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between px-6">
          <Link href="/" className="text-sm font-medium text-muted-foreground hover:text-foreground">
            OpenAisle
          </Link>
          <Badge variant="secondary" className="gap-1.5">
            <Bot className="size-3.5" /> Agent-ready store
          </Badge>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-7xl flex-1 gap-8 px-6 py-8 lg:grid-cols-[minmax(0,1fr)_400px]">
        <main className="flex min-w-0 flex-col gap-8">
          <section className="flex flex-col gap-3">
            <h1 className="text-4xl font-semibold tracking-tight">{store.name}</h1>
            {store.tagline && <p className="text-lg text-muted-foreground">{store.tagline}</p>}
            {store.description && <p className="max-w-2xl text-sm text-muted-foreground">{store.description}</p>}
            <div className="flex flex-wrap gap-2 pt-1">
              <Badge variant="outline" className="gap-1.5">
                <ShieldCheck className="size-3.5" /> Secure checkout with PayPal
              </Badge>
              {store.shippingPolicy && (
                <Badge variant="outline" className="gap-1.5">
                  <Truck className="size-3.5" /> Ships to the US
                </Badge>
              )}
              {store.agentReadinessScore !== null && (
                <Badge variant="outline">Agent-Readiness {store.agentReadinessScore}/100</Badge>
              )}
            </div>
          </section>

          <section className="flex flex-col gap-4">
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-semibold">All products</h2>
              <span className="text-sm text-muted-foreground">{products.length} items</span>
            </div>
            {products.length === 0 ? (
              <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
                No products yet.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
                {products.map((p) => (
                  <ProductCard key={p.sku} product={p} />
                ))}
              </div>
            )}
          </section>
        </main>

        <ShopChatPanel slug={store.slug} storeName={store.name} />
      </div>
    </div>
  );
}
