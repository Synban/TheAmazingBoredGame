import { Redis } from "@upstash/redis";
import { validateBoredReason } from "@/lib/bored-reason";
import { pickRandomWord } from "@/lib/random-word";

const VERSION_KEY = "bored-game:version";
const COOLDOWN_UNTIL_KEY = "bored-game:cooldown-until";
const CURRENT_WORD_KEY = "bored-game:current-word";
const CURRENT_REASON_KEY = "bored-game:current-reason";

/** 5 minutes 30 seconds */
export const COOLDOWN_MS = 5 * 60 * 1000 + 30 * 1000;

export type GameState = {
  version: number;
  cooldownUntil: number;
  currentWord: string;
  currentReason: string;
};

/** Coerce Redis values (often strings) to a non-negative integer. */
export function toNum(value: unknown): number {
  if (value == null) return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

function toReason(value: unknown): string {
  return typeof value === "string" ? value : "";
}

type GlobalSignal = typeof globalThis & {
  __version?: number;
  __cooldownUntil?: number;
  __currentWord?: string;
  __currentReason?: string;
};

function getMemoryState(): GameState {
  const g = globalThis as GlobalSignal;
  return {
    version: toNum(g.__version),
    cooldownUntil: toNum(g.__cooldownUntil),
    currentWord: typeof g.__currentWord === "string" ? g.__currentWord : "",
    currentReason: typeof g.__currentReason === "string" ? g.__currentReason : "",
  };
}

function setMemoryState(
  version: number,
  cooldownUntil: number,
  currentWord: string,
  currentReason: string,
): void {
  const g = globalThis as GlobalSignal;
  g.__version = version;
  g.__cooldownUntil = cooldownUntil;
  g.__currentWord = currentWord;
  g.__currentReason = currentReason;
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
    const rawWord = await redis.get(CURRENT_WORD_KEY);
    const rawReason = await redis.get(CURRENT_REASON_KEY);
    return {
      version,
      cooldownUntil,
      currentWord: toReason(rawWord),
      currentReason: toReason(rawReason),
    };
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

type PushSuccess = {
  ok: true;
  version: number;
  cooldownUntil: number;
  currentWord: string;
  currentReason: string;
};

type PushCooldown = {
  ok: false;
  error: "cooldown";
  cooldownRemainingMs: number;
  version: number;
  cooldownUntil: number;
  currentWord: string;
  currentReason: string;
};

type PushInvalidReason = {
  ok: false;
  error: "invalid_reason";
  message: string;
  version: number;
  cooldownUntil: number;
  currentWord: string;
  currentReason: string;
};

export type PushResult = PushSuccess | PushCooldown | PushInvalidReason;

export async function pushSignal(reasonInput: string): Promise<PushResult> {
  const validation = validateBoredReason(reasonInput);
  const now = Date.now();
  const redis = getRedis();

  async function loadExisting(): Promise<GameState> {
    if (redis) {
      const version = toNum(await redis.get(VERSION_KEY));
      const cooldownUntil = toNum(await redis.get(COOLDOWN_UNTIL_KEY));
      const rawWord = await redis.get(CURRENT_WORD_KEY);
      const rawReason = await redis.get(CURRENT_REASON_KEY);
      return {
        version,
        cooldownUntil,
        currentWord: toReason(rawWord),
        currentReason: toReason(rawReason),
      };
    }
    return getMemoryState();
  }

  if (!validation.ok) {
    const state = await loadExisting();
    return {
      ok: false,
      error: "invalid_reason",
      message: validation.message,
      version: state.version,
      cooldownUntil: state.cooldownUntil,
      currentWord: state.currentWord,
      currentReason: state.currentReason,
    };
  }

  const currentReason = validation.reason;

  if (redis) {
    const currentUntil = toNum(await redis.get(COOLDOWN_UNTIL_KEY));
    const currentVersion = toNum(await redis.get(VERSION_KEY));
    const rawWord = await redis.get(CURRENT_WORD_KEY);
    const rawReason = await redis.get(CURRENT_REASON_KEY);
    const existingWord = toReason(rawWord);
    const existingReason = toReason(rawReason);

    if (currentUntil > now) {
      return {
        ok: false,
        error: "cooldown",
        cooldownRemainingMs: currentUntil - now,
        version: currentVersion,
        cooldownUntil: currentUntil,
        currentWord: existingWord,
        currentReason: existingReason,
      };
    }

    const version = await redis.incr(VERSION_KEY);
    const cooldownUntil = now + COOLDOWN_MS;
    const currentWord = pickRandomWord();
    await redis.set(COOLDOWN_UNTIL_KEY, cooldownUntil);
    await redis.set(CURRENT_WORD_KEY, currentWord);
    await redis.set(CURRENT_REASON_KEY, currentReason);
    return {
      ok: true,
      version: toNum(version),
      cooldownUntil,
      currentWord,
      currentReason,
    };
  }

  const state = getMemoryState();
  if (state.cooldownUntil > now) {
    return {
      ok: false,
      error: "cooldown",
      cooldownRemainingMs: state.cooldownUntil - now,
      version: state.version,
      cooldownUntil: state.cooldownUntil,
      currentWord: state.currentWord,
      currentReason: state.currentReason,
    };
  }
  const version = state.version + 1;
  const cooldownUntil = now + COOLDOWN_MS;
  const currentWord = pickRandomWord();
  setMemoryState(version, cooldownUntil, currentWord, currentReason);
  return { ok: true, version, cooldownUntil, currentWord, currentReason };
}
