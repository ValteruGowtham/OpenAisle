/**
 * Turn a useChat error into a user-facing line. Non-2xx responses (e.g. our 429 rate limit) arrive
 * with the JSON body as the message; stream errors carry our already-friendly text.
 */
export function chatErrorMessage(error: Error | undefined): string {
  const raw = error?.message?.trim() ?? "";
  try {
    const parsed = JSON.parse(raw) as { error?: unknown };
    if (typeof parsed?.error === "string" && parsed.error) return parsed.error;
  } catch {
    // not JSON
  }
  if (/^(AI is busy|The AI couldn't|Too many requests)/i.test(raw)) return raw;
  if (/failed to fetch|network/i.test(raw)) return "Network hiccup. Please check your connection and retry.";
  return "AI is busy, please retry in a moment.";
}
