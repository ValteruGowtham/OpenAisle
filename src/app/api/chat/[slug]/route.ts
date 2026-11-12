import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai";
import { getDb } from "@/lib/db";
import { friendlyAiError, getChatModel } from "@/lib/llm";
import { buildAiTools } from "@/lib/store-tools";

export const maxDuration = 60;

const MAX_HISTORY = 8;

const AFFIRMATIVE =
  /\b(yes|yep|yeah|yup|sure|ok|okay|confirm(ed)?|go ahead|do it|proceed|sounds good|please do)\b/i;

/** Text of the buyer's latest message. */
function lastUserText(messages: UIMessage[]): string {
  const last = [...messages].reverse().find((m) => m.role === "user");
  return (last?.parts ?? [])
    .map((p) => (p.type === "text" ? p.text : ""))
    .join(" ")
    .trim();
}

function systemPrompt(store: { name: string; currency: string; tagline: string | null }) {
  return [
    `You are the shopping assistant for ${store.name}${store.tagline ? ` (${store.tagline})` : ""}. Prices are in ${store.currency}.`,
    "Use the tools to search the catalog. Only recommend products returned by tools; never invent products, prices or policies.",
    "When the buyer wants to buy, first reply with the items, quantities, unit prices and total, and ask \"Shall I set up the PayPal checkout?\". Only call create_checkout after they say yes.",
    "After create_checkout succeeds, say one short line telling them to click the Pay with PayPal button. Never paste links or URLs; the UI shows the button. You never take payment yourself.",
    "If a tool says something is unavailable or blocked, explain briefly and suggest alternatives.",
    "Be warm and concise: 1-3 short sentences. The UI already shows product cards, so don't repeat every detail.",
  ].join("\n");
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await getDb().store.findUnique({
    where: { slug },
    select: { name: true, currency: true, tagline: true },
  });
  if (!store) return Response.json({ error: "Store not found" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as { messages?: UIMessage[] } | null;
  const messages = (body?.messages ?? []).slice(-MAX_HISTORY);
  if (messages.length === 0) return Response.json({ error: "No messages" }, { status: 400 });

  const tools = buildAiTools(slug, { channel: "WEB_AGENT", agentClient: "web-chat" });

  // Hard guard for "confirm items and total before create_checkout": the checkout tool is only
  // offered once the buyer replies affirmatively (the prompt makes the model summarize + ask first).
  const allowCheckout = AFFIRMATIVE.test(lastUserText(messages));
  const activeTools = (Object.keys(tools) as (keyof typeof tools)[]).filter(
    (name) => name !== "create_checkout" || allowCheckout,
  );

  const result = streamText({
    model: getChatModel(),
    system: systemPrompt(store),
    messages: await convertToModelMessages(messages, { tools, ignoreIncompleteToolCalls: true }),
    tools,
    activeTools,
    stopWhen: isStepCount(5),
    maxRetries: 1,
    providerOptions: { groq: { reasoningEffort: "low" } },
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      onError: (err) => {
        console.error("[chat] stream error", err);
        return friendlyAiError(err).message;
      },
    }),
  });
}
