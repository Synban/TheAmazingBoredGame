import {
  COOLDOWN_MS,
  getCooldownRemainingMsFromStore,
  getLastSignal,
  pushSignal,
} from "@/lib/signal-store";

export const dynamic = "force-dynamic";

const NO_CACHE = {
  "Cache-Control": "private, no-store, no-cache, must-revalidate",
};

export async function GET() {
  const signal = await getLastSignal();
  const cooldownRemainingMs = await getCooldownRemainingMsFromStore();
  return Response.json({ signal, cooldownRemainingMs }, { headers: NO_CACHE });
}

export async function POST() {
  const result = await pushSignal();
  if (!result.ok) {
    const signal = await getLastSignal();
    return Response.json(
      { signal, cooldownRemainingMs: result.cooldownRemainingMs },
      { status: 429, headers: NO_CACHE },
    );
  }
  return Response.json(
    {
      signal: result.signal,
      cooldownRemainingMs: COOLDOWN_MS,
    },
    { headers: NO_CACHE },
  );
}
