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

function statePayload(
  version: number,
  cooldownUntil: number,
  cooldownRemainingMs: number,
  currentWord: string,
  currentReason: string,
) {
  return {
    version,
    signal: version,
    cooldownUntil,
    cooldownRemainingMs,
    currentWord,
    currentReason,
  };
}

export async function GET() {
  const now = Date.now();
  const { version, cooldownUntil, currentWord, currentReason } =
    await getGameState(now);
  const cooldownRemainingMs = getCooldownRemainingMs(cooldownUntil, now);
  return Response.json(
    statePayload(
      version,
      cooldownUntil,
      cooldownRemainingMs,
      currentWord,
      currentReason,
    ),
    { headers: NO_CACHE },
  );
}

export async function POST(request: Request) {
  let reason = "";
  try {
    const body = (await request.json()) as { reason?: unknown };
    reason = typeof body.reason === "string" ? body.reason : "";
  } catch {
    reason = "";
  }

  const result = await pushSignal(reason);

  if (!result.ok && result.error === "invalid_reason") {
    const cooldownRemainingMs = getCooldownRemainingMs(
      result.cooldownUntil,
      Date.now(),
    );
    return Response.json(
      {
        ...statePayload(
          result.version,
          result.cooldownUntil,
          cooldownRemainingMs,
          result.currentWord,
          result.currentReason,
        ),
        error: result.error,
        message: result.message,
      },
      { status: 400, headers: NO_CACHE },
    );
  }

  if (!result.ok) {
    return Response.json(
      statePayload(
        result.version,
        result.cooldownUntil,
        result.cooldownRemainingMs,
        result.currentWord,
        result.currentReason,
      ),
      { status: 429, headers: NO_CACHE },
    );
  }

  return Response.json(
    statePayload(
      result.version,
      result.cooldownUntil,
      COOLDOWN_MS,
      result.currentWord,
      result.currentReason,
    ),
    { headers: NO_CACHE },
  );
}
