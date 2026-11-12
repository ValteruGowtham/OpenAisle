"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Activity,
  BadgeCheck,
  Bot,
  CircleDollarSign,
  Eye,
  Percent,
  Search,
  ShieldAlert,
  ShoppingCart,
  Sparkles,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { DashboardOrder, FeedEvent, StoreStats } from "@/lib/dashboard";
import { formatMoney, toCents } from "@/lib/money";
import { cn } from "@/lib/utils";

const POLL_MS = 3000;
const MAX_FEED = 60;

type Snapshot = { stats: StoreStats; orders: DashboardOrder[]; events: FeedEvent[] };

// ---------- small presentational helpers ----------

function useNow(intervalMs = 5000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function ago(iso: string, now: number) {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

const EVENT_ICON: Record<FeedEvent["type"], { icon: LucideIcon; className: string }> = {
  SEARCH: { icon: Search, className: "bg-sky-500/10 text-sky-600" },
  VIEW: { icon: Eye, className: "bg-slate-500/10 text-slate-600" },
  CHECKOUT_CREATED: { icon: ShoppingCart, className: "bg-indigo-500/10 text-indigo-600" },
  PAYMENT_CAPTURED: { icon: BadgeCheck, className: "bg-emerald-500/10 text-emerald-600" },
  POLICY_BLOCKED: { icon: ShieldAlert, className: "bg-amber-500/10 text-amber-600" },
  REFUNDED: { icon: Undo2, className: "bg-rose-500/10 text-rose-600" },
  COPILOT_ACTION: { icon: Sparkles, className: "bg-violet-500/10 text-violet-600" },
};

export function ChannelBadge({ channel, client }: { channel: FeedEvent["channel"]; client?: string | null }) {
  if (channel === "MCP")
    return (
      <Badge className="border-transparent bg-violet-500/10 text-violet-700 dark:text-violet-300" title={client ?? undefined}>
        MCP{client && client !== "mcp-client" ? ` · ${client}` : ""}
      </Badge>
    );
  if (channel === "WEB_AGENT")
    return <Badge className="border-transparent bg-sky-500/10 text-sky-700 dark:text-sky-300">Web agent</Badge>;
  return <Badge variant="outline">Copilot</Badge>;
}

const STATUS: Record<DashboardOrder["status"], { label: string; className: string }> = {
  CREATED: { label: "Awaiting payment", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  APPROVED: { label: "Approved", className: "bg-sky-500/15 text-sky-700 dark:text-sky-400" },
  COMPLETED: { label: "Paid", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  REFUNDED: { label: "Refunded", className: "bg-rose-500/15 text-rose-700 dark:text-rose-400" },
  CANCELLED: { label: "Cancelled", className: "bg-muted text-muted-foreground" },
};

function Kpi({ icon: Icon, label, value, hint }: { icon: LucideIcon; label: string; value: string; hint: string }) {
  return (
    <Card className="gap-2 py-5">
      <CardHeader className="flex flex-row items-center justify-between gap-2 px-5">
        <CardDescription className="text-xs font-medium">{label}</CardDescription>
        <Icon className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="flex flex-col gap-0.5 px-5">
        <span className="text-3xl font-semibold tabular-nums tracking-tight">{value}</span>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </CardContent>
    </Card>
  );
}

// ---------- main component ----------

export function DashboardLive({
  slug,
  initial,
  copilot,
  missedDemand,
}: {
  slug: string;
  initial: Snapshot;
  copilot: ReactNode;
  missedDemand: ReactNode;
}) {
  const [stats, setStats] = useState(initial.stats);
  const [orders, setOrders] = useState(initial.orders);
  const [events, setEvents] = useState(initial.events);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [live, setLive] = useState(true);
  const newest = useRef(initial.events[0]?.createdAt);
  const now = useNow();

  useEffect(() => {
    let stopped = false;
    let failures = 0;

    async function poll() {
      try {
        const qs = newest.current ? `?after=${encodeURIComponent(newest.current)}` : "";
        const res = await fetch(`/api/stores/${slug}/events${qs}`, { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as Snapshot;
        if (stopped) return;
        failures = 0;
        setLive(true);
        setStats(data.stats);
        setOrders(data.orders);
        if (data.events.length > 0) {
          newest.current = data.events[0].createdAt;
          setEvents((prev) => {
            const seen = new Set(prev.map((e) => e.id));
            const added = data.events.filter((e) => !seen.has(e.id));
            return [...added, ...prev].slice(0, MAX_FEED);
          });
          const ids = data.events.map((e) => e.id);
          setFresh((prev) => new Set([...prev, ...ids]));
          setTimeout(() => {
            if (stopped) return;
            setFresh((prev) => {
              const next = new Set(prev);
              ids.forEach((id) => next.delete(id));
              return next;
            });
          }, 4000);
        }
      } catch {
        failures++;
        if (failures >= 2) setLive(false);
      }
    }

    const id = setInterval(poll, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [slug]);

  const currency = orders[0]?.currency ?? "USD";

  return (
    <div className="flex flex-col gap-6">
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi icon={Bot} label="Agent sessions" value={String(stats.sessions24h)} hint="Last 24 hours · web + MCP" />
        <Kpi icon={ShoppingCart} label="Checkouts created" value={String(stats.checkouts7d)} hint="Last 7 days" />
        <Kpi
          icon={CircleDollarSign}
          label="Revenue captured"
          value={stats.revenue7dLabel}
          hint={`${stats.paidOrders7d} paid order${stats.paidOrders7d === 1 ? "" : "s"} · 7 days${stats.refunds7d ? ` · ${stats.refunds7d} refunded` : ""}`}
        />
        <Kpi icon={Percent} label="Conversion" value={`${stats.conversionPct}%`} hint="Checkouts that got paid · 7 days" />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_440px]">
        <Card className="h-[560px] gap-0 py-0">
          <CardHeader className="flex flex-row items-center justify-between gap-3 border-b px-5 py-4">
            <div className="flex flex-col gap-1">
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="size-4" /> Live agent activity
              </CardTitle>
              <CardDescription>Every tool call from AI shoppers and your copilot</CardDescription>
            </div>
            <span
              className={cn(
                "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
                live ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-muted text-muted-foreground",
              )}
            >
              <span className={cn("size-1.5 rounded-full", live ? "animate-pulse bg-emerald-500" : "bg-muted-foreground")} />
              {live ? "Live" : "Reconnecting…"}
            </span>
          </CardHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {events.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 p-10 text-center">
                <Bot className="size-8 text-muted-foreground" />
                <p className="text-sm font-medium">No agent activity yet</p>
                <p className="max-w-xs text-xs text-muted-foreground">
                  When AI shoppers search or check out through the web chat or MCP, it shows up here instantly.
                </p>
              </div>
            ) : (
              <ul className="divide-y">
                {events.map((e) => {
                  const { icon: Icon, className } = EVENT_ICON[e.type];
                  return (
                    <li
                      key={e.id}
                      className={cn(
                        "flex items-center gap-3 px-5 py-3 transition-colors duration-1000",
                        fresh.has(e.id) && "bg-primary/[0.04] animate-in fade-in slide-in-from-top-1",
                      )}
                    >
                      <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full", className)}>
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm" title={e.summary}>
                        {e.summary}
                      </span>
                      <ChannelBadge channel={e.channel} client={e.client} />
                      <span className="w-16 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                        {ago(e.createdAt, now)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Card>

        {copilot}
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_440px]">
        <Card className="gap-0 py-0">
          <CardHeader className="border-b px-5 py-4">
            <CardTitle className="text-base">Orders</CardTitle>
            <CardDescription>Created by AI agents, paid on PayPal</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            {orders.length === 0 ? (
              <p className="p-10 text-center text-sm text-muted-foreground">
                No orders yet. Checkouts created by agents will appear here.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-5">Order</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead className="pr-5 text-right">Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((o) => {
                    const first = o.items[0];
                    const more = o.items.length - 1;
                    const s = STATUS[o.status];
                    return (
                      <TableRow key={o.id}>
                        <TableCell className="pl-5 font-mono text-xs font-medium">{o.ref}</TableCell>
                        <TableCell className="max-w-[260px]">
                          <div className="truncate text-sm" title={o.items.map((i) => `${i.quantity}× ${i.title}`).join(", ")}>
                            {first ? `${first.quantity}× ${first.title}` : "-"}
                          </div>
                          {(more > 0 || o.trackingNumber) && (
                            <div className="truncate text-xs text-muted-foreground">
                              {more > 0 ? `+${more} more` : ""}
                              {more > 0 && o.trackingNumber ? " · " : ""}
                              {o.trackingNumber ? `${o.carrier ?? "Tracking"} ${o.trackingNumber}` : ""}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {formatMoney(toCents(o.total), o.currency ?? currency)}
                        </TableCell>
                        <TableCell>
                          <Badge className={cn("border-transparent", s.className)}>{s.label}</Badge>
                        </TableCell>
                        <TableCell>
                          <ChannelBadge channel={o.channel} client={o.agentClient} />
                        </TableCell>
                        <TableCell className="pr-5 text-right text-xs tabular-nums text-muted-foreground">
                          {ago(o.createdAt, now)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {missedDemand}
      </section>
    </div>
  );
}
