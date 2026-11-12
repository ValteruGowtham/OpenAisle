import { NextResponse } from "next/server";
import { generateText, Output } from "ai";
import { ImportRequestSchema, ImportResultSchema, normalizeImport } from "@/lib/catalog";
import { friendlyAiError, withFallback } from "@/lib/llm";

export const maxDuration = 60;

const SYSTEM = `You turn messy small-shop catalogs (WhatsApp lists, notes, spreadsheets) into clean product data for AI shopping agents.
Rules: extract every distinct product; never invent products. Prices in USD (convert INR at 84 INR = 1 USD, round to .00 or .50).
If stock is missing use 5; "sold out" = 0. Write factual agentSummary lines (no hype).
Score agentReadinessScore on the ORIGINAL input (missing prices, stock, sizes, materials, images, policies all lower it) and give up to 5 specific fixes.`;

export async function POST(req: Request) {
  const parsed = ImportRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please add a store name and paste your catalog (10–20,000 characters)." },
      { status: 400 },
    );
  }
  const { storeName, rawCatalog } = parsed.data;

  try {
    const { output, model } = await withFallback(async (model, meta) => {
      const result = await generateText({
        model,
        system: SYSTEM,
        prompt: `Store name: ${storeName}\n\nRaw catalog:\n"""\n${rawCatalog}\n"""`,
        output: Output.object({ schema: ImportResultSchema }),
        maxRetries: 1,
        // gpt-oss is a reasoning model: hidden reasoning shares the output budget, so keep it
        // low and leave room for ~50 products (Groq free tier caps at 8k tokens/min).
        maxOutputTokens: 6000,
        providerOptions: { groq: { reasoningEffort: "low" } },
        abortSignal: AbortSignal.timeout(meta.fallback ? 25_000 : 30_000),
      });
      return { output: result.output, model: meta };
    });

    const normalized = normalizeImport(output);
    if (normalized.products.length === 0) {
      return NextResponse.json(
        { error: "We couldn't find any products with prices in that text. Add a price per item and try again." },
        { status: 422 },
      );
    }
    return NextResponse.json({ result: normalized, model: model.modelId });
  } catch (err) {
    console.error("[import] failed", err);
    const { message, status } = friendlyAiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
