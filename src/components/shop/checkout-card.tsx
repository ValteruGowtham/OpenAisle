"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CheckoutLine } from "@/lib/store-tools";
import { formatMoney, toCents } from "@/lib/money";

type Checkout = {
  order_ref: string;
  items: CheckoutLine[];
  total: string;
  currency: string;
  approve_url: string;
};

type Phase = "ready" | "waiting" | "paid" | "cancelled";

const POLL_MS = 3000;
const POLL_TIMEOUT_MS = 15 * 60 * 1000;

export function CheckoutCard({ slug, checkout }: { slug: string; checkout: Checkout }) {
  const [phase, setPhase] = useState<Phase>("ready");
  const money = (v: string) => formatMoney(toCents(v), checkout.currency);

  // Poll the order until it's captured (capture happens on the PayPal return page).
  useEffect(() => {
    if (phase !== "waiting") return;
    const started = Date.now();
    let cancelled = false;

    const tick = async () => {
      try {
        const res = await fetch(`/api/stores/${slug}/orders/${checkout.order_ref}`, { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;
        if (data.status === "COMPLETED") {
          setPhase("paid");
        } else if (data.status === "CANCELLED") {
          setPhase("cancelled");
        }
      } catch {
        // transient network error: keep polling
      }
    };

    const id = setInterval(() => {
      if (Date.now() - started > POLL_TIMEOUT_MS) {
        clearInterval(id);
        setPhase("ready");
        return;
      }
      void tick();
    }, POLL_MS);
    void tick();
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [phase, slug, checkout.order_ref]);

  function pay() {
    window.open(checkout.approve_url, "_blank", "noopener");
    setPhase("waiting");
  }

  if (phase === "paid") {
    return (
      <div className="w-full max-w-[88%] overflow-hidden rounded-xl border border-emerald-500/30 bg-emerald-500/5">
        <div className="flex items-center gap-2 border-b border-emerald-500/20 px-4 py-3">
          <CheckCircle2 className="size-5 text-emerald-600" />
          <div className="flex flex-col">
            <span className="text-sm font-semibold">Payment complete</span>
            <span className="text-xs text-muted-foreground">Order {checkout.order_ref}</span>
          </div>
        </div>
        <LineItems checkout={checkout} money={money} />
        <div className="flex justify-between border-t border-emerald-500/20 px-4 py-2.5 text-sm font-semibold">
          <span>Paid with PayPal</span>
          <span className="tabular-nums">{money(checkout.total)}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[88%] overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <span className="text-sm font-semibold">Checkout</span>
        <span className="font-mono text-xs text-muted-foreground">{checkout.order_ref}</span>
      </div>
      <LineItems checkout={checkout} money={money} />
      <div className="flex justify-between border-t px-4 py-2.5 text-sm font-semibold">
        <span>Total</span>
        <span className="tabular-nums">{money(checkout.total)}</span>
      </div>
      <div className="flex flex-col gap-2 px-4 pb-4">
        {phase === "cancelled" ? (
          <p className="text-center text-xs text-muted-foreground">This checkout was cancelled.</p>
        ) : (
          <Button
            onClick={pay}
            className="h-11 w-full bg-[#FFC439] font-semibold text-[#003087] hover:bg-[#f2b72f]"
          >
            {phase === "waiting" ? <Loader2 className="animate-spin" /> : <ExternalLink />}
            {phase === "waiting" ? "Waiting for PayPal approval…" : "Pay with PayPal"}
          </Button>
        )}
        <p className="text-center text-[11px] text-muted-foreground">
          {phase === "waiting"
            ? "Finish in the PayPal tab. This card updates automatically."
            : "You'll review and approve the payment on PayPal."}
        </p>
      </div>
    </div>
  );
}

/** Priced preview shown before the buyer confirms (no order exists yet). */
export function OrderSummaryCard({
  items,
  total,
  currency,
}: {
  items: CheckoutLine[];
  total: string;
  currency: string;
}) {
  const money = (v: string) => formatMoney(toCents(v), currency);
  return (
    <div className="w-full max-w-[88%] overflow-hidden rounded-xl border border-dashed bg-card">
      <div className="border-b border-dashed px-4 py-2.5 text-sm font-semibold">Order summary</div>
      <LineItems checkout={{ items }} money={money} />
      <div className="flex justify-between border-t border-dashed px-4 py-2.5 text-sm font-semibold">
        <span>Total</span>
        <span className="tabular-nums">{money(total)}</span>
      </div>
      <p className="px-4 pb-3 text-[11px] text-muted-foreground">Reply &ldquo;yes&rdquo; to check out with PayPal.</p>
    </div>
  );
}

function LineItems({
  checkout,
  money,
}: {
  checkout: Pick<Checkout, "items">;
  money: (v: string) => string;
}) {
  return (
    <ul className="flex flex-col gap-1.5 px-4 py-3">
      {checkout.items.map((it) => (
        <li key={it.sku} className="flex justify-between gap-3 text-xs">
          <span className="min-w-0 truncate">
            {it.quantity} × {it.title}
          </span>
          <span className="shrink-0 tabular-nums">{money(it.line_total)}</span>
        </li>
      ))}
    </ul>
  );
}
