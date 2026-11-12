# OpenAisle

Make any small shop buyable by AI agents, with PayPal checkout. See `CLAUDE.md` for the full spec.

## Setup

```bash
cp .env.example .env.local   # fill in values
npm install
npm run db:push
npm run seed
npm run dev
```

Scripts: `dev`, `build`, `start`, `lint`, `seed`, `db:push`.

## Deploy (Render)

`render.yaml` defines the web service (Node 22, Singapore, health check `/api/health`).
Render dashboard → **New → Blueprint** → this repo, then fill the prompted env vars
(see `.env.example`). Set `APP_URL` to the service's `https://….onrender.com` URL, and point a
PayPal sandbox webhook (`PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.REFUNDED`) at
`https://….onrender.com/api/paypal/webhook`, then put its ID in `PAYPAL_WEBHOOK_ID`.
