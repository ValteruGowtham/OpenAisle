"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, Copy, FileText, PlugZap } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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

function CopyBlock({ label, value, code = false }: { label: string; value: string; code?: boolean }) {
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
    <div className="relative rounded-lg border bg-muted/50">
      <pre
        className={`max-h-56 overflow-auto p-3 pr-12 font-mono text-xs leading-relaxed ${
          code ? "whitespace-pre" : "whitespace-pre-wrap [overflow-wrap:anywhere]"
        }`}
      >
        {value}
      </pre>
      <Button
        size="icon"
        variant="ghost"
        className="absolute top-1.5 right-1.5 size-8"
        onClick={copy}
        aria-label={`Copy ${label}`}
      >
        {copied ? <Check className="text-emerald-600" /> : <Copy />}
      </Button>
    </div>
  );
}

export function ConnectAiDialog({
  storeName,
  slug,
  mcpUrl,
  llmsUrl,
}: {
  storeName: string;
  slug: string;
  mcpUrl: string;
  llmsUrl: string;
}) {
  const claudeConfig = JSON.stringify(
    { mcpServers: { [slug]: { command: "npx", args: ["-y", "mcp-remote", mcpUrl] } } },
    null,
    2,
  );
  const cursorConfig = JSON.stringify({ mcpServers: { [slug]: { url: mcpUrl } } }, null, 2);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <PlugZap /> Connect your AI
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Shop {storeName} from your AI assistant</DialogTitle>
          <DialogDescription>
            This store has its own MCP server. Connect Claude, Cursor or any MCP client to search products and check
            out with PayPal. Prices always come from the store, and you approve every payment on PayPal.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium">MCP server URL (Streamable HTTP)</span>
          <CopyBlock label="MCP URL" value={mcpUrl} />
        </div>

        <Tabs defaultValue="claude" className="gap-3">
          <TabsList className="w-full">
            <TabsTrigger value="claude">Claude Desktop</TabsTrigger>
            <TabsTrigger value="cursor">Cursor</TabsTrigger>
          </TabsList>
          <TabsContent value="claude" className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">
              Add to <code className="font-mono">claude_desktop_config.json</code> (Settings → Developer → Edit Config),
              then restart Claude. Once the store is on a public HTTPS URL you can also add the MCP URL under Settings →
              Connectors → Add custom connector.
            </p>
            <CopyBlock label="Claude Desktop config" value={claudeConfig} code />
          </TabsContent>
          <TabsContent value="cursor" className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">
              Add to <code className="font-mono">~/.cursor/mcp.json</code> (or Settings → MCP → Add new server).
            </p>
            <CopyBlock label="Cursor config" value={cursorConfig} code />
          </TabsContent>
        </Tabs>

        <a
          href={llmsUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <FileText className="size-3.5" /> Agent-readable store info (llms.txt)
        </a>
      </DialogContent>
    </Dialog>
  );
}
