import { Redis } from "@upstash/redis";

const SIGNAL_KEY = "bored-game:last-signal";
const COOLDOWN_UNTIL_KEY = "bored-game:cooldown-until";

export const COOLDOWN_MS = 5 * 60 * 1000;

/** Redis REST clients return numbers as strings; coerce before math. */
export function toMs(value: unknown): number {
  if (value == null) return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function getCooldownRemainingMs(lastSignal: number, now = Date.now()): number {
  const last = toMs(lastSignal);
  if (last <= 0) return 0;
  return Math.max(0, last + COOLDOWN_MS - now);
}

type GlobalSignal = typeof globalThis & {
  __lastSignal?: number;
  __cooldownUntil?: number;
};

function getMemorySignal(): number {
  return toMs((globalThis as GlobalSignal).__lastSignal);
}

function setMemorySignal(value: number): void {
  (globalThis as GlobalSignal).__lastSignal = value;
}

function getMemoryCooldownUntil(): number {
  return toMs((globalThis as GlobalSignal).__cooldownUntil);
}

function setMemoryCooldownUntil(value: number): void {
  (globalThis as GlobalSignal).__cooldownUntil = value;
}

function getRedis(): Redis | null {
  const url =
    process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

export async function getLastSignal(): Promise<number> {
  const redis = getRedis();
  if (redis) {
    const value = await redis.get(SIGNAL_KEY);
    return toMs(value);
  }
  return getMemorySignal();
}

export async function getCooldownRemainingMsFromStore(
  now = Date.now(),
): Promise<number> {
  const redis = getRedis();
  if (redis) {
    const until = toMs(await redis.get(COOLDOWN_UNTIL_KEY));
    if (until > now) return until - now;
    // Backfill from legacy signal-only records
    const signal = toMs(await redis.get(SIGNAL_KEY));
    return getCooldownRemainingMs(signal, now);
  }
  const until = getMemoryCooldownUntil();
  if (until > now) return until - now;
  return getCooldownRemainingMs(getMemorySignal(), now);
}

export type PushResult =
  | { ok: true; signal: number }
  | { ok: false; cooldownRemainingMs: number };

const PUSH_SCRIPT = `
local signalKey = KEYS[1]
local untilKey = KEYS[2]
local now = tonumber(ARGV[1])
local cooldown = tonumber(ARGV[2])
local until = tonumber(redis.call('GET', untilKey) or '0')
if until > now then
  return {0, until - now}
end
local nextUntil = now + cooldown
redis.call('SET', signalKey, now)
redis.call('SET', untilKey, nextUntil)
return {1, now}
`;

function parseEvalResult(raw: unknown): [number, number] {
  if (!Array.isArray(raw) || raw.length < 2) {
    throw new Error("Unexpected Redis eval response");
  }
  return [toMs(raw[0]), toMs(raw[1])];
}

export async function pushSignal(): Promise<PushResult> {
  const now = Date.now();
  const redis = getRedis();

  if (redis) {
    const raw = await redis.eval(
      PUSH_SCRIPT,
      [SIGNAL_KEY, COOLDOWN_UNTIL_KEY],
      [String(now), String(COOLDOWN_MS)],
    );
    const [ok, value] = parseEvalResult(raw);
    if (ok === 0) {
      return { ok: false, cooldownRemainingMs: value };
    }
    return { ok: true, signal: value };
  }

  const until = getMemoryCooldownUntil();
  if (until > now) {
    return { ok: false, cooldownRemainingMs: until - now };
  }
  setMemorySignal(now);
  setMemoryCooldownUntil(now + COOLDOWN_MS);
  return { ok: true, signal: now };
}
