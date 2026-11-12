"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, getToolName, isToolUIPart, type UIMessage } from "ai";
import { AlertCircle, ArrowUp, Check, Loader2, RotateCcw, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { chatErrorMessage } from "@/lib/chat-errors";
import { cn } from "@/lib/utils";

const SUGGESTIONS = [
  "Refund the most recent order",
  "Add tracking 1Z999AA10123456784 (UPS) to OA-1001",
  "Invoice buyer@example.com for 20 cotton stoles at $14 each",
];

const TOOL_LABEL: Record<string, string> = {
  lookup_order: "Looking up order",
  get_store_stats: "Reading store stats",
  get_missed_demand: "Analyzing missed demand",
  get_order: "PayPal · get order",
  create_refund: "PayPal · create refund",
  create_shipment_tracking: "PayPal · add tracking",
  create_and_send_invoice: "PayPal · create & send invoice",
  list_transactions: "PayPal · list transactions",
};

const PAYPAL_TOOLS = new Set(["get_order", "create_refund", "create_shipment_tracking", "create_and_send_invoice", "list_transactions"]);

type Out = Record<string, unknown> | undefined;

/** One-line result for a finished tool call. */
function outcome(name: string, out: Out): { ok: boolean; text: string } {
  if (!out) return { ok: true, text: "Done" };
  const failed = out.ok === false;
  const err = () => {
    const e = out.error as Record<string, unknown> | string | undefined;
    if (typeof e === "string") return e;
    return String(e?.message ?? e?.name ?? "PayPal returned an error");
  };
  if (failed) return { ok: false, text: err() };
  switch (name) {
    case "create_refund":
      return { ok: true, text: `Refunded ${out.order_ref} · $${out.refunded}${out.full_refund ? "" : " (partial)"} · ${out.status}` };
    case "create_shipment_tracking":
      return { ok: true, text: `Tracking ${out.carrier ?? ""} ${out.tracking_number} added to ${out.order_ref}` };
    case "create_and_send_invoice":
      return { ok: true, text: `Invoice ${out.invoice_id} · $${out.total} sent to ${out.recipient}` };
    case "get_order":
      return { ok: true, text: `PayPal order ${out.id} · ${out.status}` };
    case "lookup_order":
      return out.found === false ? { ok: false, text: String(out.message ?? "Not found") } : { ok: true, text: "Order found" };
    default:
      return { ok: true, text: "Done" };
  }
}

function RichText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <p className="whitespace-pre-wrap">
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>,
      )}
    </p>
  );
}

export function CopilotPanel({ slug }: { slug: string }) {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const { messages, sendMessage, status, error, regenerate, clearError } = useChat<UIMessage>({
    transport: new DefaultChatTransport({ api: `/api/copilot/${slug}` }),
  });
  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, status]);

  function send(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    if (error) clearError();
    sendMessage({ text: t });
    setInput("");
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    send(input);
  }

  return (
    <Card className="h-[560px] gap-0 py-0">
      <CardHeader className="border-b px-5 py-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-4" /> Merchant Copilot
        </CardTitle>
        <CardDescription>Refunds, tracking and invoices via PayPal Agent Toolkit (sandbox)</CardDescription>
      </CardHeader>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col justify-end gap-3">
            <p className="text-sm text-muted-foreground">
              Ask in plain English. The copilot looks up your orders and acts on PayPal for you.
            </p>
            <p className="text-xs text-muted-foreground">
              Commands like “Refund OA-1003”, “Add tracking … to OA-1001” or “Invoice …” run instantly on PayPal, no AI
              needed.
            </p>
            <div className="flex flex-col items-start gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full border px-3 py-1.5 text-left text-xs transition-colors hover:bg-muted"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((m) => (
              <div key={m.id} className={cn("flex flex-col gap-1.5", m.role === "user" ? "items-end" : "items-start")}>
                {m.parts.map((part, i) => {
                  const key = `${m.id}-${i}`;
                  if (part.type === "text") {
                    if (!part.text.trim()) return null;
                    return (
                      <div
                        key={key}
                        className={cn(
                          "max-w-[90%] rounded-2xl px-3.5 py-2 text-sm",
                          m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted",
                        )}
                      >
                        <RichText text={part.text} />
                      </div>
                    );
                  }
                  if (!isToolUIPart(part)) return null;
                  const name = getToolName(part);
                  const label = TOOL_LABEL[name] ?? name;
                  const paypal = PAYPAL_TOOLS.has(name);

                  if (part.state === "output-available" || part.state === "output-error") {
                    const res =
                      part.state === "output-error"
                        ? { ok: false, text: "Tool failed" }
                        : outcome(name, part.output as Out);
                    return (
                      <div
                        key={key}
                        className={cn(
                          "flex max-w-[90%] items-start gap-2 rounded-lg border px-3 py-2 text-xs",
                          res.ok ? "border-emerald-500/30 bg-emerald-500/5" : "border-rose-500/30 bg-rose-500/5",
                        )}
                      >
                        {res.ok ? (
                          <Check className="mt-px size-3.5 shrink-0 text-emerald-600" />
                        ) : (
                          <X className="mt-px size-3.5 shrink-0 text-rose-600" />
                        )}
                        <span className="min-w-0">
                          <span className="font-medium">{label}</span>
                          {paypal && <span className="ml-1 text-muted-foreground">(Agent Toolkit)</span>}
                          <span className="block text-muted-foreground [overflow-wrap:anywhere]">{res.text}</span>
                        </span>
                      </div>
                    );
                  }
                  return (
                    <div key={key} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="size-3 animate-spin" /> {label}…
                    </div>
                  );
                })}
              </div>
            ))}
            {status === "submitted" && (
              <div className="flex items-center gap-1.5 px-1 text-muted-foreground" aria-label="Copilot is thinking">
                <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-current" />
              </div>
            )}
          </div>
        )}
        {error && (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm">
            <span className="flex items-center gap-2 text-amber-800 dark:text-amber-300">
              <AlertCircle className="size-4 shrink-0" /> {chatErrorMessage(error)}
            </span>
            <Button size="sm" variant="outline" onClick={() => regenerate()}>
              <RotateCcw /> Retry
            </Button>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={onSubmit} className="flex items-center gap-2 border-t p-3">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="e.g. Refund OA-1003"
          maxLength={500}
          aria-label="Copilot message"
        />
        <Button type="submit" size="icon" disabled={busy || !input.trim()} aria-label="Send">
          {busy ? <Loader2 className="animate-spin" /> : <ArrowUp />}
        </Button>
      </form>
    </Card>
  );
}
