"use client";

import { FileText, PlugZap } from "lucide-react";
import { CopyBlock } from "@/components/copy-block";
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
