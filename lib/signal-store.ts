import { Redis } from "@upstash/redis";

const VERSION_KEY = "bored-game:version";
const COOLDOWN_UNTIL_KEY = "bored-game:cooldown-until";
/** Legacy key; only used to seed version once */
const LEGACY_SIGNAL_KEY = "bored-game:last-signal";

export const COOLDOWN_MS = 5 * 60 * 1000;

export type GameState = {
  version: number;
  cooldownUntil: number;
};

/** Redis REST clients return numbers as strings; coerce before math. */
export function toMs(value: unknown): number {
  if (value == null) return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

type GlobalSignal = typeof globalThis & {
  __version?: number;
  __cooldownUntil?: number;
};

function getMemoryState(): GameState {
  return {
    version: toMs((globalThis as GlobalSignal).__version),
    cooldownUntil: toMs((globalThis as GlobalSignal).__cooldownUntil),
  };
}

function setMemoryState(version: number, cooldownUntil: number): void {
  const g = globalThis as GlobalSignal;
  g.__version = version;
  g.__cooldownUntil = cooldownUntil;
}

function getRedis(): Redis | null {
  const url =
    process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

async function ensureVersionMigrated(redis: Redis): Promise<void> {
  const existing = await redis.get(VERSION_KEY);
  if (toMs(existing) > 0) return;
  const legacy = toMs(await redis.get(LEGACY_SIGNAL_KEY));
  if (legacy > 0) {
    await redis.set(VERSION_KEY, 1);
  }
}

export async function getGameState(now = Date.now()): Promise<GameState> {
  const redis = getRedis();
  if (redis) {
    await ensureVersionMigrated(redis);
    const [versionRaw, untilRaw] = await redis.mget<[unknown, unknown]>(
      VERSION_KEY,
      COOLDOWN_UNTIL_KEY,
    );
    const version = toMs(versionRaw);
    let cooldownUntil = toMs(untilRaw);
    if (cooldownUntil <= now && version > 0) {
      const legacy = toMs(await redis.get(LEGACY_SIGNAL_KEY));
      if (legacy > 0) {
        cooldownUntil = legacy + COOLDOWN_MS;
      }
    }
    return { version, cooldownUntil };
  }
  return getMemoryState();
}

export function getCooldownRemainingMs(
  cooldownUntil: number,
  now = Date.now(),
): number {
  const until = toMs(cooldownUntil);
  if (until <= now) return 0;
  return until - now;
}

export type PushResult =
  | { ok: true; version: number; cooldownUntil: number }
  | { ok: false; cooldownRemainingMs: number; version: number; cooldownUntil: number };

const PUSH_SCRIPT = `
local versionKey = KEYS[1]
local untilKey = KEYS[2]
local now = tonumber(ARGV[1])
local cooldown = tonumber(ARGV[2])
local until = tonumber(redis.call('GET', untilKey) or '0')
local version = tonumber(redis.call('GET', versionKey) or '0')
if until > now then
  return {0, until - now, version, until}
end
version = redis.call('INCR', versionKey)
local nextUntil = now + cooldown
redis.call('SET', untilKey, nextUntil)
return {1, 0, version, nextUntil}
`;

function parseEvalResult(
  raw: unknown,
): { ok: true; version: number; cooldownUntil: number } | { ok: false; cooldownRemainingMs: number; version: number; cooldownUntil: number } {
  if (!Array.isArray(raw) || raw.length < 4) {
    throw new Error("Unexpected Redis eval response");
  }
  const ok = Number(raw[0]);
  if (ok === 0) {
    return {
      ok: false,
      cooldownRemainingMs: toMs(raw[1]),
      version: toMs(raw[2]),
      cooldownUntil: toMs(raw[3]),
    };
  }
  return {
    ok: true,
    version: toMs(raw[2]),
    cooldownUntil: toMs(raw[3]),
  };
}

export async function pushSignal(): Promise<PushResult> {
  const now = Date.now();
  const redis = getRedis();

  if (redis) {
    await ensureVersionMigrated(redis);
    const raw = await redis.eval(
      PUSH_SCRIPT,
      [VERSION_KEY, COOLDOWN_UNTIL_KEY],
      [String(now), String(COOLDOWN_MS)],
    );
    const parsed = parseEvalResult(raw);
    if (!parsed.ok) {
      return {
        ok: false,
        cooldownRemainingMs: parsed.cooldownRemainingMs,
        version: parsed.version,
        cooldownUntil: parsed.cooldownUntil,
      };
    }
    return {
      ok: true,
      version: parsed.version,
      cooldownUntil: parsed.cooldownUntil,
    };
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
