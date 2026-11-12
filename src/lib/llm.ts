import { groq } from "@ai-sdk/groq";
import { google } from "@ai-sdk/google";
import {
  APICallError,
  NoObjectGeneratedError,
  RetryError,
  wrapLanguageModel,
  type LanguageModel,
} from "ai";

/** Primary model (Groq free tier). */
export const PRIMARY_MODEL_ID = "openai/gpt-oss-120b";

/** Fallback model (Gemini free tier). `gemini-flash-latest` tracks Google's current Flash. */
export const FALLBACK_MODEL_ID = process.env.GEMINI_MODEL || "gemini-flash-latest";

export const AI_BUSY_MESSAGE = "AI is busy right now, retrying. Please try again in a moment.";

export function getModel(): LanguageModel {
  return groq(PRIMARY_MODEL_ID);
}

export function getFallbackModel(): LanguageModel {
  return google(FALLBACK_MODEL_ID);
}

export type ModelMeta = { provider: "groq" | "google"; modelId: string; fallback: boolean };

/**
 * Model for streaming chat: Groq, transparently falling back to Gemini when Groq fails before
 * streaming starts (429 rate limit / 5xx). `withFallback` can't wrap a stream, so this does it at
 * the model layer via middleware: same params, different provider.
 */
export function getChatModel(): LanguageModel {
  const fallback = google(FALLBACK_MODEL_ID);
  if (!process.env.GROQ_API_KEY) return fallback;

  return wrapLanguageModel({
    model: groq(PRIMARY_MODEL_ID),
    middleware: {
      wrapGenerate: async ({ doGenerate, params }) => {
        try {
          return await doGenerate();
        } catch (err) {
          if (!isRateLimitOrServerError(err)) throw err;
          console.warn(`[llm] Groq ${statusOf(err)} on generate, falling back to ${FALLBACK_MODEL_ID}`);
          return fallback.doGenerate(params);
        }
      },
      wrapStream: async ({ doStream, params }) => {
        try {
          return await doStream();
        } catch (err) {
          if (!isRateLimitOrServerError(err)) throw err;
          console.warn(`[llm] Groq ${statusOf(err)} on stream, falling back to ${FALLBACK_MODEL_ID}`);
          return fallback.doStream(params);
        }
      },
    },
  });
}

function statusOf(err: unknown): number | undefined {
  if (APICallError.isInstance(err)) return err.statusCode;
  if (RetryError.isInstance(err)) return statusOf(err.lastError);
  return undefined;
}

/** True for rate limits (429) and provider-side failures (5xx). */
export function isRateLimitOrServerError(err: unknown): boolean {
  const status = statusOf(err);
  return status === 429 || (status !== undefined && status >= 500);
}

/** Groq rejected its own structured output (e.g. truncated JSON → 400 json_validate_failed). */
function isBadStructuredOutput(err: unknown): boolean {
  if (NoObjectGeneratedError.isInstance(err)) return true;
  const inner = RetryError.isInstance(err) ? err.lastError : err;
  return APICallError.isInstance(inner) && (inner.responseBody ?? "").includes("json_validate_failed");
}

/**
 * Run `fn` with the Groq model; on 429/5xx, bad structured output, or Groq not configured,
 * retry once with Gemini.
 */
export async function withFallback<T>(
  fn: (model: LanguageModel, meta: ModelMeta) => Promise<T>,
): Promise<T> {
  const hasGroq = Boolean(process.env.GROQ_API_KEY);
  if (hasGroq) {
    try {
      return await fn(getModel(), { provider: "groq", modelId: PRIMARY_MODEL_ID, fallback: false });
    } catch (err) {
      if (!isRateLimitOrServerError(err) && !isBadStructuredOutput(err)) throw err;
      console.warn(
        `[llm] Groq failed (${statusOf(err) ?? "bad output"}), falling back to ${FALLBACK_MODEL_ID}`,
      );
    }
  }
  return fn(getFallbackModel(), { provider: "google", modelId: FALLBACK_MODEL_ID, fallback: true });
}

/** A user-safe message for any AI failure; never leak raw provider errors to the UI. */
export function friendlyAiError(err: unknown): { message: string; status: number } {
  if (isRateLimitOrServerError(err)) return { message: AI_BUSY_MESSAGE, status: 503 };
  return {
    message: "The AI couldn't process that. Try again, or simplify the input.",
    status: 502,
  };
}
