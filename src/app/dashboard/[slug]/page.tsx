import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, Gauge } from "lucide-react";
import { CopyBlock } from "@/components/copy-block";
import { CopilotPanel } from "@/components/dashboard/copilot-panel";
import { DashboardLive } from "@/components/dashboard/dashboard-live";
import { MissedDemandCard } from "@/components/dashboard/missed-demand-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getFeed, getRecentOrders, getStoreStats } from "@/lib/dashboard";
import { getDb } from "@/lib/db";
import { appUrl, mcpUrl } from "@/lib/urls";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const store = await getDb().store.findUnique({ where: { slug }, select: { name: true } });
  return { title: store ? `${store.name} · Dashboard · OpenAisle` : "Dashboard · OpenAisle" };
}

export default async function DashboardPage({ params }: Props) {
  const { slug } = await params;
  const store = await getDb().store.findUnique({
    where: { slug },
    select: { id: true, slug: true, name: true, currency: true, agentReadinessScore: true },
  });
  if (!store) notFound();

  const [stats, orders, events] = await Promise.all([
    getStoreStats(store.id, store.currency),
    getRecentOrders(store.id),
    getFeed(store.id, store.currency),
  ]);
  const endpoint = mcpUrl(appUrl(), store.slug);

  return (
    <div className="flex flex-1 flex-col bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex w-full max-w-[1440px] flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-sm font-medium text-muted-foreground hover:text-foreground">
              OpenAisle
            </Link>
            <span className="text-muted-foreground">/</span>
            <h1 className="text-lg font-semibold tracking-tight">{store.name}</h1>
            {store.agentReadinessScore !== null && (
              <Badge variant="secondary" className="gap-1">
                <Gauge className="size-3.5" /> Agent-Readiness {store.agentReadinessScore}
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="hidden text-xs font-medium text-muted-foreground md:inline">Your MCP endpoint</span>
              <CopyBlock
                label="MCP endpoint"
                value={endpoint}
                className="w-[min(440px,80vw)] [&_pre]:overflow-x-auto [&_pre]:py-2 [&_pre]:whitespace-nowrap"
              />
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href={`/s/${store.slug}`} target="_blank">
                <ExternalLink /> View storefront
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1440px] px-6 py-6">
        <DashboardLive
          slug={store.slug}
          initial={{ stats, orders, events }}
          copilot={<CopilotPanel slug={store.slug} />}
          missedDemand={<MissedDemandCard slug={store.slug} />}
        />
      </main>
    </div>
  );
}
