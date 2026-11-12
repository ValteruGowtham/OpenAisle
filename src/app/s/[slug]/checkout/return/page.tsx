import type { Metadata } from "next";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { captureCheckout, type CaptureOutcome } from "@/lib/checkout";
import { formatMoney, toCents } from "@/lib/money";

export const metadata: Metadata = { title: "Order confirmation · OpenAisle" };

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ token?: string }>;
};

export default async function CheckoutReturnPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { token } = await searchParams;

  const outcome: CaptureOutcome = token
    ? await captureCheckout(slug, token)
    : { kind: "error", message: "This link is missing its PayPal order reference." };

  return (
    <main className="flex flex-1 items-center justify-center bg-muted/30 px-6 py-16">
      <Card className="w-full max-w-md">
        {outcome.kind === "completed" ? <Receipt outcome={outcome} /> : <Problem outcome={outcome} />}
        <CardContent className="flex flex-col gap-2 pt-2">
          <Button asChild variant={outcome.kind === "completed" ? "outline" : "default"}>
            <Link href={`/s/${slug}`}>Back to store</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}

function Receipt({ outcome }: { outcome: Extract<CaptureOutcome, { kind: "completed" }> }) {
  const money = (v: string) => formatMoney(toCents(v), outcome.currency);
  return (
    <>
      <CardHeader className="flex flex-col items-center gap-3 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-emerald-500/15">
          <CheckCircle2 className="size-6 text-emerald-600" />
        </div>
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold">Payment complete</h1>
          <p className="text-sm text-muted-foreground">
            Thanks for shopping with {outcome.storeName}. You can close this tab. Your chat has updated too.
          </p>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <dl className="grid grid-cols-2 gap-y-1.5 rounded-lg bg-muted/60 px-4 py-3 text-sm">
          <dt className="text-muted-foreground">Order</dt>
          <dd className="text-right font-mono">{outcome.orderRef}</dd>
          {outcome.buyerEmail && (
            <>
              <dt className="text-muted-foreground">Receipt to</dt>
              <dd className="truncate text-right">{outcome.buyerEmail}</dd>
            </>
          )}
          <dt className="text-muted-foreground">Paid with</dt>
          <dd className="text-right">PayPal</dd>
        </dl>
        <ul className="flex flex-col gap-2">
          {outcome.items.map((it) => (
            <li key={it.sku} className="flex justify-between gap-4 text-sm">
              <span className="min-w-0">
                <span className="text-muted-foreground">{it.quantity} ×</span> {it.title}
              </span>
              <span className="shrink-0 tabular-nums">{money(it.line_total)}</span>
            </li>
          ))}
        </ul>
        <div className="flex justify-between border-t pt-3 font-semibold">
          <span>Total</span>
          <span className="tabular-nums">{money(outcome.total)}</span>
        </div>
        {outcome.captureId && (
          <p className="text-center font-mono text-[11px] text-muted-foreground">Capture {outcome.captureId}</p>
        )}
      </CardContent>
    </>
  );
}

function Problem({ outcome }: { outcome: Exclude<CaptureOutcome, { kind: "completed" }> }) {
  const view = {
    not_found: {
      icon: AlertCircle,
      title: "Order not found",
      body: "We couldn't find this order in the store. If you were charged, contact the store with your PayPal receipt.",
    },
    not_approved: {
      icon: Clock,
      title: "Payment not approved yet",
      body: "This order hasn't been approved on PayPal, so nothing was charged. Use the Pay with PayPal button in the chat to finish.",
    },
    pending: {
      icon: Clock,
      title: "Payment pending",
      body: "PayPal is still processing this payment. We'll mark the order paid as soon as it clears.",
    },
    error: { icon: AlertCircle, title: "Something went wrong", body: "" },
  }[outcome.kind];
  const Icon = view.icon;
  const body = outcome.kind === "error" ? outcome.message : view.body;

  return (
    <CardHeader className="flex flex-col items-center gap-3 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
        <Icon className="size-6 text-muted-foreground" />
      </div>
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">{view.title}</h1>
        <p className="text-sm text-muted-foreground">{body}</p>
        {"orderRef" in outcome && <p className="font-mono text-xs text-muted-foreground">{outcome.orderRef}</p>}
        {outcome.kind === "error" && outcome.debugId && (
          <p className="font-mono text-[11px] text-muted-foreground">PayPal debug id {outcome.debugId}</p>
        )}
      </div>
    </CardHeader>
  );
}
