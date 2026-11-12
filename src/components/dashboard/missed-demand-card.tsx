"use client";

import { useCallback, useEffect, useState } from "react";
import { Lightbulb, RefreshCw, SearchX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { MissedDemand } from "@/lib/missed-demand";

export function MissedDemandCard({ slug }: { slug: string }) {
  const [data, setData] = useState<MissedDemand | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchData = useCallback(
    async (refresh: boolean): Promise<MissedDemand> => {
      const res = await fetch(`/api/stores/${slug}/missed-demand${refresh ? "?refresh=1" : ""}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      return res.json();
    },
    [slug],
  );

  // Initial load: state starts as "loading", so only set state once the request settles.
  useEffect(() => {
    let alive = true;
    fetchData(false)
      .then((d) => alive && setData(d))
      .catch(() => alive && setError(true))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [fetchData]);

  async function load(refresh: boolean) {
    setLoading(true);
    setError(false);
    try {
      setData(await fetchData(refresh));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="flex flex-row items-start justify-between gap-3 border-b px-5 py-4">
        <div className="flex flex-col gap-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <SearchX className="size-4" /> Missed demand
          </CardTitle>
          <CardDescription>
            {data && data.totalSearches > 0
              ? `${data.totalSearches} agent searches found nothing · last 7 days`
              : "What AI shoppers wanted but couldn't find"}
          </CardDescription>
        </div>
        <Button variant="ghost" size="icon" className="size-8" onClick={() => load(true)} disabled={loading} aria-label="Refresh missed demand">
          <RefreshCw className={loading ? "animate-spin" : ""} />
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 p-5">
        {loading && !data ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)
        ) : error && !data ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <p className="text-sm text-muted-foreground">AI is busy, couldn&apos;t analyze searches right now.</p>
            <Button size="sm" variant="outline" onClick={() => load(true)}>
              Retry
            </Button>
          </div>
        ) : !data || data.opportunities.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No missed searches yet. When agents search for things you don&apos;t sell, opportunities appear here.
          </p>
        ) : (
          data.opportunities.map((o, i) => (
            <div key={`${o.title}-${i}`} className="flex flex-col gap-2 rounded-xl border p-3.5">
              <div className="flex items-start justify-between gap-3">
                <span className="text-sm font-semibold leading-snug">{o.title}</span>
                <Badge variant="secondary" className="shrink-0 tabular-nums">
                  {o.count} {o.count === 1 ? "search" : "searches"}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-1">
                {o.example_queries.map((q) => (
                  <span key={q} className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                    “{q}”
                  </span>
                ))}
              </div>
              <div className="flex items-start gap-1.5 text-xs">
                <Lightbulb className="mt-px size-3.5 shrink-0 text-amber-500" />
                <span>
                  <span className="font-medium">Add:</span> {o.suggested_product}{" "}
                  <span className="text-muted-foreground">· {o.suggested_price_range}</span>
                </span>
              </div>
            </div>
          ))
        )}
        {data?.source === "heuristic" && (
          <p className="text-[11px] text-muted-foreground">AI clustering unavailable right now; showing top searches.</p>
        )}
      </CardContent>
    </Card>
  );
}
