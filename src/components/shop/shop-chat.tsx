"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type InferUITools, type UIDataTypes, type UIMessage } from "ai";
import { AlertCircle, ArrowUp, Ban, Loader2, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { StoreTools } from "@/lib/store-tools";
import { cn } from "@/lib/utils";
import { CheckoutCard } from "./checkout-card";
import { ChatProductCard } from "./chat-product-card";

export type ShopUIMessage = UIMessage<never, UIDataTypes, InferUITools<StoreTools>>;

const SUGGESTIONS = ["Silk scarf under $50", "A gift for my mom", "What's your return policy?"];

const TOOL_LABEL: Record<string, string> = {
  "tool-search_products": "Searching the catalog…",
  "tool-get_product": "Looking up the product…",
  "tool-create_checkout": "Creating your PayPal checkout…",
  "tool-get_order_status": "Checking your order…",
  "tool-get_store_info": "Reading store policies…",
};

/** Minimal markdown: **bold** and line breaks. */
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

export function ShopChat({ slug, storeName }: { slug: string; storeName: string }) {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const { messages, sendMessage, status, error, regenerate, clearError } = useChat<ShopUIMessage>({
    transport: new DefaultChatTransport({ api: `/api/chat/${slug}` }),
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
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col justify-end gap-4 pb-2">
            <div className="flex flex-col gap-1.5">
              <div className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Sparkles className="size-4" />
              </div>
              <p className="text-sm font-medium">Hi! I&apos;m {storeName}&apos;s shopping assistant.</p>
              <p className="text-sm text-muted-foreground">
                Tell me what you&apos;re looking for. I can find products, answer questions and set up a PayPal checkout.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full border px-3 py-1.5 text-xs transition-colors hover:bg-muted"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {messages.map((m) => (
              <div key={m.id} className={cn("flex flex-col gap-2", m.role === "user" ? "items-end" : "items-start")}>
                {m.parts.map((part, i) => {
                  const key = `${m.id}-${i}`;
                  if (part.type === "text") {
                    if (!part.text.trim()) return null;
                    return (
                      <div
                        key={key}
                        className={cn(
                          "max-w-[88%] rounded-2xl px-3.5 py-2 text-sm",
                          m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted",
                        )}
                      >
                        <RichText text={part.text} />
                      </div>
                    );
                  }
                  if (!isToolPart(part)) return null;
                  return <ToolPartView key={key} part={part} slug={slug} />;
                })}
              </div>
            ))}
            {status === "submitted" && (
              <div className="flex items-center gap-1.5 px-1 text-muted-foreground" aria-label="Assistant is typing">
                <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-current" />
              </div>
            )}
          </div>
        )}
        {error && (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm">
            <span className="flex items-center gap-2 text-amber-800 dark:text-amber-300">
              <AlertCircle className="size-4 shrink-0" /> AI is busy, please retry in a moment.
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
          placeholder="Ask about products, sizes, shipping…"
          maxLength={500}
          aria-label="Message"
        />
        <Button type="submit" size="icon" disabled={busy || !input.trim()} aria-label="Send">
          {busy ? <Loader2 className="animate-spin" /> : <ArrowUp />}
        </Button>
      </form>
    </div>
  );
}

type MessagePart = ShopUIMessage["parts"][number];
type ToolPart = Extract<MessagePart, { type: `tool-${string}` }>;

const isToolPart = (part: MessagePart): part is ToolPart => part.type.startsWith("tool-");

function ToolPartView({ part, slug }: { part: ToolPart; slug: string }) {
  if (part.state === "input-streaming" || part.state === "input-available") {
    return (
      <div className="flex w-full max-w-[88%] flex-col gap-2">
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" /> {TOOL_LABEL[part.type] ?? "Working…"}
        </span>
        {part.type === "tool-search_products" && <Skeleton className="h-20 w-full" />}
      </div>
    );
  }
  if (part.state === "output-error") {
    return <p className="text-xs text-muted-foreground">That didn&apos;t work. Please try again.</p>;
  }
  if (part.state !== "output-available") return null;

  switch (part.type) {
    case "tool-search_products": {
      const { results } = part.output;
      if (results.length === 0) return null;
      return (
        <div className="-mx-1 flex w-full gap-2 overflow-x-auto px-1 pb-1">
          {results.map((p) => (
            <ChatProductCard key={p.sku} product={p} />
          ))}
        </div>
      );
    }
    case "tool-get_product": {
      if (!part.output.found) return null;
      return (
        <div className="flex w-full">
          <ChatProductCard product={part.output.product} wide />
        </div>
      );
    }
    case "tool-create_checkout": {
      const out = part.output;
      if (!out.ok) {
        return (
          <div className="flex max-w-[88%] items-start gap-2 rounded-xl border border-dashed px-3 py-2 text-xs text-muted-foreground">
            <Ban className="mt-0.5 size-3.5 shrink-0" /> {out.reason}
          </div>
        );
      }
      return <CheckoutCard slug={slug} checkout={out} />;
    }
    default:
      return null;
  }
}
