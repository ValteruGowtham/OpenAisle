# CLAUDE.md — OpenAisle

Project for the PayPal AI Hackathon (Devpost). Hard deadline: Nov 12, 12:00pm PST. Solo developer.
**Ship a working, polished demo over a large, half-working one.**

## What we're building
OpenAisle makes any small shop buyable by AI agents, with PayPal checkout:
- Merchant pastes a messy catalog → the LLM normalizes it into products + an Agent-Readiness Score → store published.
- Each store gets a **remote MCP endpoint** (`/api/mcp/[slug]`) and a web "Shop with AI" chat. Both use the SAME buyer tools.
- Checkout = a PayPal Orders v2 order created server-side; the buyer approves on PayPal; we capture on return.
- Merchant dashboard: live agent activity feed, orders, Missed Demand (LLM clusters zero-result agent searches), and a Merchant Copilot built on `@paypal/agent-toolkit` (refunds, tracking, invoices).

## Stack (do not change without asking)
- Next.js (latest, App Router, TypeScript, `src/`), Tailwind, shadcn/ui, zod
- Prisma + Postgres
- Vercel AI SDK: `ai`, `@ai-sdk/react`, `@ai-sdk/groq` (primary model `openai/gpt-oss-120b`), `@ai-sdk/google` (Gemini Flash fallback on 429/5xx)
- PayPal: REST via fetch in `src/lib/paypal.ts` (sandbox: `https://api-m.sandbox.paypal.com`) + `@paypal/agent-toolkit` for the merchant copilot
- MCP: `mcp-handler` + the MCP SDK version its README requires (Streamable HTTP, stateless)
- Deploy target: Render (Node web service + Render Postgres)

## Folder layout
```
src/app/
  page.tsx                         landing
  onboard/page.tsx                 catalog import
  s/[slug]/page.tsx                storefront + Shop-with-AI chat + Connect-your-AI dialog
  s/[slug]/checkout/return/page.tsx  capture + receipt
  s/[slug]/llms.txt/route.ts       agent discovery text
  dashboard/[slug]/page.tsx        merchant dashboard + copilot
  api/chat/[slug]/route.ts         buyer agent (streamText + store tools)
  api/copilot/[slug]/route.ts      merchant copilot (streamText + Agent Toolkit tools)
  api/mcp/[slug]/route.ts          MCP server (same store tools)
  api/stores/import/route.ts       catalog import (generateObject)
  api/stores/[slug]/events/route.ts  feed polling
  api/stores/[slug]/missed-demand/route.ts
  api/paypal/webhook/route.ts
  api/health/route.ts
src/lib/
  db.ts  paypal.ts  llm.ts  store-tools.ts  events.ts  money.ts  utils.ts
prisma/schema.prisma  prisma/seed.ts
```

## Data model
- Store(id, slug unique, name, tagline, description, currency="USD", returnPolicy, shippingPolicy, maxOrderValue Decimal default 500, agentReadinessScore Int?, readinessReport Json?, createdAt)
- Product(id, storeId, sku, title, description, agentSummary, price Decimal(10,2), stock Int, imageUrl, attributes Json, tags String[], paypalProductId?, createdAt; @@unique([storeId, sku]))
- Order(id, storeId, ref unique "OA-1001"..., paypalOrderId unique, status enum CREATED|APPROVED|COMPLETED|REFUNDED|CANCELLED, items Json, total Decimal(10,2), currency, captureId?, buyerEmail?, channel enum WEB_AGENT|MCP, agentClient?, trackingNumber?, carrier?, createdAt, updatedAt)
- AgentEvent(id, storeId, type enum SEARCH|VIEW|CHECKOUT_CREATED|PAYMENT_CAPTURED|REFUNDED|POLICY_BLOCKED|COPILOT_ACTION, channel, query?, resultCount?, payload Json, createdAt; index on storeId+createdAt)

## Buyer tools (src/lib/store-tools.ts). Exactly 5; used by both chat and MCP.
1. `search_products(query, max_price?, limit<=8)`: log SEARCH with resultCount
2. `get_product(sku)`
3. `create_checkout(items[{sku, quantity}], buyer_note?)`: recompute prices from the DB, check stock + maxOrderValue (log POLICY_BLOCKED and return a friendly reason if violated), create an itemized PayPal order, save Order, return `{order_ref, total, currency, approve_url}`
4. `get_order_status(order_ref)`
5. `get_store_info()`

## Non-negotiable rules
- **Never trust prices, totals or currency from the LLM or the MCP client.** Always recompute from the DB.
- The agent never captures payment. Capture happens only on the PayPal return URL or via webhook, after buyer approval.
- PayPal amounts are 2-decimal strings; `amount.breakdown.item_total` must equal the sum of `unit_amount × quantity` exactly. Use `src/lib/money.ts` (integer cents) for math.
- Capture and webhook handlers must be **idempotent**.
- Avoid vault/saved payment sources (sandbox returns NOT_ENABLED_TO_VAULT_PAYMENT_SOURCE).
- Secrets only via env vars; never commit `.env*`; keep `.env.example` updated.
- Free-tier LLM limits: short system prompts, ≤6 tools per agent, trim history to the last 8 messages, `maxSteps`/`stopWhen` ≤ 6, and fall back to Gemini on 429. Show a friendly "AI is busy, retrying" state, never a raw error.
- Log every tool call as an AgentEvent (it powers the live feed and the demo).
- UI: clean, modern, consistent. shadcn components, one accent color, proper loading/empty/error states. It must look good in a screen recording at 1080p.
- After each phase: `npm run build` and `npm run lint` must pass, then commit.
- If a library API differs from what this file assumes (AI SDK, mcp-handler, agent-toolkit versions), read the installed package's README/types and adapt. Don't guess. Tell me what changed.

## Env vars
DATABASE_URL, PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_ENV=sandbox, PAYPAL_WEBHOOK_ID, GROQ_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, APP_URL

## Demo store
Seed `kaveri-handlooms`: an Indian handloom exporter selling to US buyers in USD. 14 products. Also seed ~15 zero-result SEARCH events (e.g. "indigo silk scarf", "men's kurta", "block print bedsheet king") so Missed Demand has data.
