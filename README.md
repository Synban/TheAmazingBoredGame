# The Amazing Bored Game

One button. When anyone pushes **I'm Bored**, every open tab flashes red, then back to black. A random search word is picked for everyone, shown as **Current Word**, and the button is on a **global 5:30 cooldown** — a red countdown (`M:SS`) appears between the word and the button until it expires.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in two browser windows. Click **I'm Bored** in one — both should flash and show the same word.

Local dev uses in-memory storage (fine for a single machine / one server process).

## Deploy on Vercel

1. Push this repo to GitHub and import it in [Vercel](https://vercel.com).
2. **Required for production:** connect [Upstash Redis](https://upstash.com) to the Vercel project (Marketplace → Upstash → add to project). That sets env vars automatically. Cooldown and cross-user sync **do not work** without a shared store — each serverless instance has its own memory.

   Supported env var names (Upstash integration or Vercel KV):

   - `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`, or
   - `KV_REST_API_URL` + `KV_REST_API_TOKEN`

   After adding Redis, **redeploy** so the new variables are picked up.

3. Deploy. `npm run build` / `npm run start` match what Vercel runs.

## How it works

- **POST `/api/signal`** — bumps a monotonic `version` (Redis `INCR`) if not on cooldown; otherwise returns `429`.
- **GET `/api/signal`** — returns `version`, `cooldownUntil` (absolute ms), and `cooldownRemainingMs`; the page polls and flashes only when `version` increases.
- Cooldown state is shared via the same Redis key (or in-memory store locally). All clients disable the button and show the timer while cooldown is active.
- The pusher also flashes immediately so they do not wait for the next poll.
