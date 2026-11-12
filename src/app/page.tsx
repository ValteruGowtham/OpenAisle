import Link from "next/link";
import { Bot, PlugZap, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const features = [
  {
    icon: Bot,
    title: "Agent-ready catalog",
    body: "Paste a messy catalog. We normalize it and score how ready it is for AI shoppers.",
  },
  {
    icon: PlugZap,
    title: "Remote MCP endpoint",
    body: "Every store gets an MCP server and a Shop-with-AI chat that share the same tools.",
  },
  {
    icon: ShieldCheck,
    title: "PayPal checkout",
    body: "Agents create the order. Buyers approve on PayPal. Prices are always recomputed server-side.",
  },
];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-16 px-6 py-24">
      <section className="flex flex-col items-start gap-6">
        <Badge variant="secondary">PayPal AI Hackathon</Badge>
        <h1 className="max-w-3xl text-5xl font-semibold tracking-tight">
          Make any small shop buyable by AI agents.
        </h1>
        <p className="max-w-2xl text-lg text-muted-foreground">
          OpenAisle turns your catalog into an agent-ready store with a remote MCP endpoint, a
          Shop-with-AI chat, and PayPal checkout, in minutes.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link href="/onboard">Import your catalog</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/s/kaveri-handlooms">See demo store</Link>
          </Button>
        </div>
      </section>
      <section className="grid gap-4 md:grid-cols-3">
        {features.map(({ icon: Icon, title, body }) => (
          <Card key={title}>
            <CardHeader>
              <Icon className="size-5 text-primary" />
              <CardTitle>{title}</CardTitle>
              <CardDescription>{body}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </section>
    </main>
  );
}
