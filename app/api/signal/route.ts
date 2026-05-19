import {
  COOLDOWN_MS,
  getCooldownRemainingMs,
  getGameState,
  pushSignal,
} from "@/lib/signal-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_CACHE = {
  "Cache-Control": "private, no-store, no-cache, must-revalidate",
  Pragma: "no-cache",
};

export async function GET() {
  const now = Date.now();
  const { version, cooldownUntil } = await getGameState(now);
  const cooldownRemainingMs = getCooldownRemainingMs(cooldownUntil, now);
  return Response.json(
    { version, cooldownUntil, cooldownRemainingMs },
    { headers: NO_CACHE },
  );
}

export async function POST() {
  const result = await pushSignal();
  if (!result.ok) {
    return Response.json(
      {
        version: result.version,
        cooldownUntil: result.cooldownUntil,
        cooldownRemainingMs: result.cooldownRemainingMs,
      },
      { status: 429, headers: NO_CACHE },
    );
  }
  return Response.json(
    {
      version: result.version,
      cooldownUntil: result.cooldownUntil,
      cooldownRemainingMs: COOLDOWN_MS,
    },
    { headers: NO_CACHE },
  );
}
