"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Clipboard API first; falls back to execCommand where the API is blocked (iframes, http, embedded browsers). */
async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    return;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = value;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    if (!ok) throw new Error("copy failed");
  }
}

/** Monospace value with a copy button. `code` keeps JSON formatting (scrolls instead of wrapping). */
export function CopyBlock({
  label,
  value,
  code = false,
  className,
}: {
  label: string;
  value: string;
  code?: boolean;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await copyText(value);
      setCopied(true);
      toast.success(`${label} copied`);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy. Select the text and copy it manually.");
    }
  }

  return (
    <div className={cn("relative rounded-lg border bg-muted/50", className)}>
      <pre
        className={cn(
          "max-h-56 overflow-auto p-3 pr-12 font-mono text-xs leading-relaxed",
          code ? "whitespace-pre" : "whitespace-pre-wrap [overflow-wrap:anywhere]",
        )}
      >
        {value}
      </pre>
      <Button
        size="icon"
        variant="ghost"
        className="absolute top-1/2 right-1.5 size-8 -translate-y-1/2 data-[code=true]:top-1.5 data-[code=true]:translate-y-0"
        data-code={code}
        onClick={copy}
        aria-label={`Copy ${label}`}
      >
        {copied ? <Check className="text-emerald-600" /> : <Copy />}
      </Button>
    </div>
  );
}
