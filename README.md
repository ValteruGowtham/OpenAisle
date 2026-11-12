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
