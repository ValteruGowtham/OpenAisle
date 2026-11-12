"use client";

import { useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ShopChat } from "./shop-chat";

/** Sticky side panel on desktop; full-screen overlay behind a floating button on mobile. One chat instance. */
export function ShopChatPanel({ slug, storeName }: { slug: string; storeName: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <aside
        className={cn(
          "z-40 flex-col bg-background",
          open ? "fixed inset-0 flex" : "hidden",
          "lg:sticky lg:top-6 lg:flex lg:h-[calc(100vh-3rem)] lg:self-start",
        )}
      >
        <div className="flex h-full flex-col overflow-hidden lg:rounded-2xl lg:border lg:shadow-sm">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="flex flex-col">
              <span className="text-sm font-semibold">Shop with AI</span>
              <span className="text-xs text-muted-foreground">Ask anything about {storeName}</span>
            </div>
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(false)} aria-label="Close chat">
              <X />
            </Button>
          </div>
          <ShopChat slug={slug} storeName={storeName} />
        </div>
      </aside>

      {!open && (
        <Button
          size="lg"
          className="fixed right-5 bottom-5 z-30 rounded-full shadow-lg lg:hidden"
          onClick={() => setOpen(true)}
        >
          <MessageCircle /> Shop with AI
        </Button>
      )}
    </>
  );
}
