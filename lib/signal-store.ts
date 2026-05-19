import { Redis } from "@upstash/redis";

const VERSION_KEY = "bored-game:version";
const COOLDOWN_UNTIL_KEY = "bored-game:cooldown-until";

export const COOLDOWN_MS = 5 * 60 * 1000;

export type GameState = {
  version: number;
  cooldownUntil: number;
};

/** Coerce Redis values (often strings) to a non-negative integer. */
export function toNum(value: unknown): number {
  if (value == null) return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

type GlobalSignal = typeof globalThis & {
  __version?: number;
  __cooldownUntil?: number;
};

function getMemoryState(): GameState {
  return {
    version: toNum((globalThis as GlobalSignal).__version),
    cooldownUntil: toNum((globalThis as GlobalSignal).__cooldownUntil),
  };
}

function setMemoryState(version: number, cooldownUntil: number): void {
  const g = globalThis as GlobalSignal;
  g.__version = version;
  g.__cooldownUntil = cooldownUntil;
}

function getRedis(): Redis | null {
  const url =
    process.env.UPSTASH_REDIS_REST_URL ??
    process.env.KV_REST_API_URL ??
    process.env.STORAGE_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ??
    process.env.KV_REST_API_TOKEN ??
    process.env.STORAGE_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

export async function getGameState(now = Date.now()): Promise<GameState> {
  const redis = getRedis();
  if (redis) {
    const version = toNum(await redis.get(VERSION_KEY));
    const cooldownUntil = toNum(await redis.get(COOLDOWN_UNTIL_KEY));
    return { version, cooldownUntil };
  }
  return getMemoryState();
}

export function getCooldownRemainingMs(
  cooldownUntil: number,
  now = Date.now(),
): number {
  const until = toNum(cooldownUntil);
  if (until <= now) return 0;
  return until - now;
}

export type PushResult =
  | { ok: true; version: number; cooldownUntil: number }
  | { ok: false; cooldownRemainingMs: number; version: number; cooldownUntil: number };

export async function pushSignal(): Promise<PushResult> {
  const now = Date.now();
  const redis = getRedis();

  if (redis) {
    const currentUntil = toNum(await redis.get(COOLDOWN_UNTIL_KEY));
    const currentVersion = toNum(await redis.get(VERSION_KEY));

    if (currentUntil > now) {
      return {
        ok: false,
        cooldownRemainingMs: currentUntil - now,
        version: currentVersion,
        cooldownUntil: currentUntil,
      };
    }

    const version = await redis.incr(VERSION_KEY);
    const cooldownUntil = now + COOLDOWN_MS;
    await redis.set(COOLDOWN_UNTIL_KEY, cooldownUntil);
    return { ok: true, version: toNum(version), cooldownUntil };
  }

  const state = getMemoryState();
  if (state.cooldownUntil > now) {
    return {
      ok: false,
      cooldownRemainingMs: state.cooldownUntil - now,
      version: state.version,
      cooldownUntil: state.cooldownUntil,
    };
  }
  const version = state.version + 1;
  const cooldownUntil = now + COOLDOWN_MS;
  setMemoryState(version, cooldownUntil);
  return { ok: true, version, cooldownUntil };
}
