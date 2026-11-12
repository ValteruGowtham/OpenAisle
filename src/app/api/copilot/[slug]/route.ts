import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai";
import { buildCopilotTools } from "@/lib/copilot";
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
