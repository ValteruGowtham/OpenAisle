import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai";
import { buildCopilotTools } from "@/lib/copilot";
import { runDirectCommand, type DirectResult } from "@/lib/copilot-commands";
import { getDb } from "@/lib/db";
import { friendlyAiError, getChatModel } from "@/lib/llm";

export const maxDuration = 60;

const MAX_HISTORY = 8;

function systemPrompt(store: { name: string; currency: string }) {
  return [
    `You are the merchant copilot for ${store.name} (PayPal sandbox, prices in ${store.currency}). You act on the merchant's instructions using tools.`,
    "Orders are referenced as OA-1001 etc. Use lookup_order to get an order's capture_id and paypal_order_id before refunds or tracking; for 'most recent order' call lookup_order without order_ref and pick the newest COMPLETED one.",
    "Refunds: only refund COMPLETED orders; omit amount for a full refund. Tracking: transaction_id = capture_id.",
    "Never invent ids, amounts or results; report exactly what the tools returned, including errors.",
    "Reply in 1-3 short sentences. Plain text, **bold** and '- ' bullets only; no tables or headings.",
  ].join("\n");
}

/**
 * Stream a no-AI command result in the same UI message format as an AI turn: a tool call + its
 * output (rendered as the usual result pill) followed by a one-line reply.
 */
function directResponse(r: DirectResult) {
  const toolCallId = `direct_${crypto.randomUUID()}`;
  const textId = `text_${crypto.randomUUID()}`;
  return createUIMessageStreamResponse({
    stream: createUIMessageStream({
      execute: ({ writer }) => {
        writer.write({ type: "start" });
        writer.write({ type: "start-step" });
        writer.write({ type: "tool-input-available", toolCallId, toolName: r.toolName, input: r.input });
        writer.write({ type: "tool-output-available", toolCallId, output: r.output });
        writer.write({ type: "text-start", id: textId });
        writer.write({ type: "text-delta", id: textId, delta: r.reply });
        writer.write({ type: "text-end", id: textId });
        writer.write({ type: "finish-step" });
        writer.write({ type: "finish" });
      },
    }),
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await getDb().store.findUnique({
    where: { slug },
    select: { id: true, slug: true, name: true, currency: true },
  });
  if (!store) return Response.json({ error: "Store not found" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as { messages?: UIMessage[] } | null;
  const messages = (body?.messages ?? []).slice(-MAX_HISTORY);
  if (messages.length === 0) return Response.json({ error: "No messages" }, { status: 400 });

  // Clear commands (refund / tracking / invoice / order status) run directly: no LLM tokens.
  const last = [...messages].reverse().find((m) => m.role === "user");
  const text = (last?.parts ?? []).map((p) => (p.type === "text" ? p.text : "")).join(" ").trim();
  try {
    const direct = await runDirectCommand(store, text);
    if (direct) return directResponse(direct);
  } catch (err) {
    console.error("[copilot] direct command failed", err);
    return directResponse({
      toolName: "lookup_order",
      input: {},
      output: { found: false, message: "PayPal or the database didn't respond" },
      reply: "Something went wrong talking to PayPal. Please try again in a moment.",
    });
  }

  const tools = buildCopilotTools(store);

  const result = streamText({
    model: getChatModel(),
    system: systemPrompt(store),
    messages: await convertToModelMessages(messages, { tools, ignoreIncompleteToolCalls: true }),
    tools,
    stopWhen: isStepCount(6),
    maxRetries: 1,
    providerOptions: { groq: { reasoningEffort: "low" } },
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      onError: (err) => {
        console.error("[copilot] stream error", err);
        return friendlyAiError(err).message;
      },
    }),
  });
}
