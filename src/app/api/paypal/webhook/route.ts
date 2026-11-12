import { NextResponse } from "next/server";
import { PayPalError, verifyWebhookSignature } from "@/lib/paypal";
import { handlePayPalWebhook, type PayPalWebhookEvent } from "@/lib/webhooks";

export const dynamic = "force-dynamic";

/**
 * PayPal webhook: PAYMENT.CAPTURE.COMPLETED and PAYMENT.CAPTURE.REFUNDED.
 * Every delivery is verified with PayPal's verify-webhook-signature API (PAYPAL_WEBHOOK_ID) before
 * anything is read or written. Processing is idempotent, so retries are safe; on a processing error
 * we return 500 so PayPal retries later.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  let event: PayPalWebhookEvent;
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!process.env.PAYPAL_WEBHOOK_ID) {
    console.error("[webhook] PAYPAL_WEBHOOK_ID is not set; rejecting delivery");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  let verified = false;
  try {
    verified = await verifyWebhookSignature(req.headers, raw);
  } catch (err) {
    // PayPal answers 4xx when the PayPal-* headers are missing or malformed: treat as unverified.
    if (!(err instanceof PayPalError && err.status >= 400 && err.status < 500)) {
      console.error("[webhook] signature verification errored", err);
      return NextResponse.json({ error: "Verification unavailable" }, { status: 503 });
    }
  }
  if (!verified) {
    console.warn("[webhook] rejected unverified delivery", {
      transmission_id: req.headers.get("paypal-transmission-id"),
      event_type: event.event_type,
    });
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  try {
    const result = await handlePayPalWebhook(event);
    console.log(`[webhook] ${event.event_type} ${event.id}: ${result.action}${result.order_ref ? ` (${result.order_ref})` : ""}`);
    return NextResponse.json({ received: true, ...result });
  } catch (err) {
    console.error("[webhook] processing failed", event.event_type, event.id, err);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
