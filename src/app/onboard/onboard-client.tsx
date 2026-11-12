"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Sparkles, Store, Wand2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import type { ImportResult } from "@/lib/catalog";
import { cn } from "@/lib/utils";
import { publishStore } from "./actions";

const SAMPLE_NAME = "Meera's Weaves";
const SAMPLE_CATALOG = `🙏 Namaste all!! New stock this week 👇👇

1) ikat dupatta silk - mustard/maroon 2.2mtr .. Rs 3200 ✅ (6 pcs)
2) kalamkari cushion covr 16x16 set of 2 – $24
3)Chanderi saree mint green w/ gold buti — 7500/- incl blouse piece. only 2 left!!
4. Block print table runner (indigo) 72 inch ,,, 1800rs
5. kantha throw blanket 50x60" rainbow colours, recycled cotton 💯 – $65 – SOLD OUT 😢
- pashmina stole grey, very soft!! 8900 rs, 3 pcs
- jute tote bag w/ ajrakh print 950/-
* Kanjeevaram silk saree RED with zari border 🔥 wedding special Rs.14,500 (pls DM for photos)
  -> blouse stitching extra

ship to USA 🇺🇸 7-10 days. DM for more pics 📸
photos: https://picsum.photos/seed/meera-ikat/800/800 (ikat one)`;

type Preview = { result: ImportResult; model: string };

function scoreTone(score: number) {
  if (score >= 75) return { label: "Agent-ready", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" };
  if (score >= 50) return { label: "Needs work", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400" };
  return { label: "Not ready", className: "bg-red-500/15 text-red-700 dark:text-red-400" };
}

const usd = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

export function OnboardClient() {
  const [storeName, setStoreName] = useState("");
  const [rawCatalog, setRawCatalog] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [publishing, startPublish] = useTransition();

  function loadSample() {
    setStoreName(SAMPLE_NAME);
    setRawCatalog(SAMPLE_CATALOG);
    setPreview(null);
  }

  async function analyze() {
    if (storeName.trim().length < 2) return toast.error("Give your store a name first.");
    if (rawCatalog.trim().length < 10) return toast.error("Paste your catalog first.");
    setAnalyzing(true);
    setPreview(null);
    try {
      const res = await fetch("/api/stores/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeName, rawCatalog }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Something went wrong. Please try again.");
      setPreview(json as Preview);
      toast.success(`Found ${json.result.products.length} products`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setAnalyzing(false);
    }
  }

  function publish() {
    if (!preview) return;
    startPublish(async () => {
      const res = await publishStore({ storeName, result: preview.result });
      if (res?.error) toast.error(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <CardTitle>1. Paste your catalog</CardTitle>
            <CardDescription>Any format works. Prices in ₹ are converted to USD.</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={loadSample} disabled={analyzing || publishing}>
            <Wand2 /> Load sample
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Input
            placeholder="Store name, e.g. Kaveri Handlooms"
            value={storeName}
            onChange={(e) => setStoreName(e.target.value)}
            maxLength={80}
            className="max-w-md"
          />
          <Textarea
            placeholder={"1) silk scarf red - $40 (10 pcs)\n2) cotton saree blue 6500rs ..."}
            value={rawCatalog}
            onChange={(e) => setRawCatalog(e.target.value)}
            className="min-h-72 font-mono text-sm"
            maxLength={20000}
          />
          <div className="flex items-center justify-between gap-4">
            <span className="text-xs text-muted-foreground">{rawCatalog.length.toLocaleString()} / 20,000</span>
            <Button onClick={analyze} disabled={analyzing || publishing} size="lg">
              {analyzing ? <Loader2 className="animate-spin" /> : <Sparkles />}
              {analyzing ? "Analyzing…" : "Analyze catalog"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {analyzing && <PreviewSkeleton />}

      {preview && (
        <PreviewPanel preview={preview} publishing={publishing} onPublish={publish} />
      )}
    </div>
  );
}

function PreviewPanel({
  preview,
  publishing,
  onPublish,
}: {
  preview: Preview;
  publishing: boolean;
  onPublish: () => void;
}) {
  const { result } = preview;
  const tone = scoreTone(result.agentReadinessScore);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 md:grid-cols-[280px_1fr]">
        <Card>
          <CardHeader>
            <CardDescription>Agent-Readiness Score</CardDescription>
            <div className="flex items-end gap-2">
              <span className="text-6xl font-semibold tabular-nums tracking-tight">
                {result.agentReadinessScore}
              </span>
              <span className="pb-2 text-muted-foreground">/ 100</span>
            </div>
            <Badge className={cn("w-fit border-transparent", tone.className)}>{tone.label}</Badge>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Scored on your original catalog. Publishing uses the cleaned-up version below.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Top fixes</CardTitle>
            <CardDescription>{result.store.tagline}</CardDescription>
          </CardHeader>
          <CardContent>
            {result.fixes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing to fix. Nice catalog!</p>
            ) : (
              <ol className="flex flex-col gap-2.5">
                {result.fixes.map((fix, i) => (
                  <li key={i} className="flex gap-3 text-sm">
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                      {i + 1}
                    </span>
                    <span>{fix}</span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <CardTitle>2. Review {result.products.length} products</CardTitle>
            <CardDescription>Each product gets a factual summary written for AI agents.</CardDescription>
          </div>
          <Button onClick={onPublish} disabled={publishing} size="lg">
            {publishing ? <Loader2 className="animate-spin" /> : <Store />}
            {publishing ? "Publishing…" : "Publish store"}
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-32">SKU</TableHead>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead className="hidden lg:table-cell">Agent summary</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.products.map((p) => (
                <TableRow key={p.sku}>
                  <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                  <TableCell>
                    <div className="font-medium">{p.title}</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {p.tags.slice(0, 4).map((t) => (
                        <Badge key={t} variant="secondary" className="text-[10px]">
                          {t}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{usd(p.price)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {p.stock === 0 ? <Badge variant="outline">Sold out</Badge> : p.stock}
                  </TableCell>
                  <TableCell className="hidden max-w-sm whitespace-normal text-xs text-muted-foreground lg:table-cell">
                    {p.agentSummary}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
            <CheckCircle2 className="size-3.5" /> Parsed by {preview.model}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function PreviewSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 md:grid-cols-[280px_1fr]">
        <Skeleton className="h-44" />
        <Skeleton className="h-44" />
      </div>
      <Card>
        <CardContent className="flex flex-col gap-3 pt-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
