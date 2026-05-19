# The Amazing Bored Game

One button. When anyone pushes it, every open tab flashes red, then back to black. After a push, the button is on a **global 5-minute cooldown** for everyone — a red countdown (`M:SS`) appears above the button until it expires.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in two browser windows. Click **Push** in one — both should flash.

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

- **POST `/api/signal`** — records a new signal (timestamp) if not on cooldown; otherwise returns `429` with remaining cooldown ms.
- **GET `/api/signal`** — returns the latest signal and cooldown remaining; the page polls in a loop and flashes when the signal changes.
- Cooldown state is shared via the same Redis key (or in-memory store locally). All clients disable the button and show the timer while cooldown is active.
- The pusher also flashes immediately so they do not wait for the next poll.
