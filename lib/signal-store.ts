import { Redis } from "@upstash/redis";

const SIGNAL_KEY = "bored-game:last-signal";

type GlobalSignal = typeof globalThis & {
  __lastSignal?: number;
};

function getMemorySignal(): number {
  return (globalThis as GlobalSignal).__lastSignal ?? 0;
}

function setMemorySignal(value: number): void {
  (globalThis as GlobalSignal).__lastSignal = value;
}

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

export async function getLastSignal(): Promise<number> {
  const redis = getRedis();
  if (redis) {
    const value = await redis.get<number>(SIGNAL_KEY);
    return value ?? 0;
  }
  return getMemorySignal();
}

export async function pushSignal(): Promise<number> {
  const next = Date.now();
  const redis = getRedis();
  if (redis) {
    await redis.set(SIGNAL_KEY, next);
    return next;
  }
  setMemorySignal(next);
  return next;
}
