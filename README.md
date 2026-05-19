# The Amazing Bored Game

One button. When anyone pushes it, every open tab flashes red, then back to black.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in two browser windows. Click **Push** in one — both should flash.

Local dev uses in-memory storage (fine for a single machine / one server process).

## Deploy on Vercel

1. Push this repo to GitHub and import it in [Vercel](https://vercel.com).
2. For **multiple users in production**, add [Upstash Redis](https://upstash.com) (free tier) and set these env vars on the Vercel project:

   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

   Without Redis, each serverless instance only syncs tabs that hit the same instance — unreliable at scale.

3. Deploy. `npm run build` / `npm run start` match what Vercel runs.

## How it works

- **POST `/api/signal`** — records a new signal (timestamp).
- **GET `/api/signal`** — returns the latest signal; the page polls in a loop and flashes when the value changes.
- The pusher also flashes immediately so they do not wait for the next poll.
