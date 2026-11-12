import { NextResponse } from "next/server";

/**
 * Tiny in-memory fixed-window rate limiter (single Render instance, no dependencies).
 * Protects the free-tier LLM budget and PayPal sandbox from scripted hammering.
 */

type Window = { count: number; resetAt: number };

const windows = new Map<string, Window>();

// Drop expired windows every minute so the map can't grow without bound.
const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [key, w] of windows) if (w.resetAt <= now) windows.delete(key);
}, 60_000);
sweeper.unref?.();

/** Client IP: first x-forwarded-for value (Render's proxy), falling back to "anon". */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  const first = xff?.split(",")[0]?.trim();
  return first || req.headers.get("x-real-ip")?.trim() || "anon";
}

export type LimitResult = { ok: true } | { ok: false; retryAfter: number };

/** Count one hit for `bucket:key`; ok=false once `limit` hits happen within `windowMs`. */
export function hit(bucket: string, key: string, limit: number, windowMs: number): LimitResult {
  const now = Date.now();
  const id = `${bucket}:${key}`;
  let w = windows.get(id);
  if (!w || w.resetAt <= now) {
    w = { count: 0, resetAt: now + windowMs };
    windows.set(id, w);
  }
  w.count++;
  if (w.count > limit) return { ok: false, retryAfter: Math.max(1, Math.ceil((w.resetAt - now) / 1000)) };
  return { ok: true };
}

export const RATE_LIMIT_MESSAGE = "Too many requests, please slow down.";

/** Per-IP limit for a route. Returns a 429 response to send, or null to continue. */
export function rateLimit(req: Request, bucket: string, limit: number, windowMs = 60_000): NextResponse | null {
  const res = hit(bucket, clientIp(req), limit, windowMs);
  if (res.ok) return null;
  return NextResponse.json(
    { error: RATE_LIMIT_MESSAGE },
    { status: 429, headers: { "Retry-After": String(res.retryAfter) } },
  );
}
