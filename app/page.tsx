"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const POLL_MS = 400;
const FLASH_MS = 600;
const TICK_MS = 250;
const STORAGE_VERSION_KEY = "bored-game:last-version";

type SignalResponse = {
  version: number;
  cooldownUntil: number;
  cooldownRemainingMs?: number;
};

function toMs(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function formatCooldown(ms: number): string {
  const totalSec = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function readStoredVersion(): number {
  try {
    return toMs(sessionStorage.getItem(STORAGE_VERSION_KEY));
  } catch {
    return 0;
  }
}

function writeStoredVersion(version: number): void {
  try {
    sessionStorage.setItem(STORAGE_VERSION_KEY, String(version));
  } catch {
    /* private mode / blocked */
  }
}

export default function Home() {
  const [sending, setSending] = useState(false);
  const [cooldownEndsAt, setCooldownEndsAt] = useState(0);
  const [cooldownMs, setCooldownMs] = useState(0);
  const lastSeenVersion = useRef(0);
  const flashTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollSeq = useRef(0);

  const onCooldown = cooldownMs > 0;

  const flash = useCallback(() => {
    document.body.classList.add("flash");
    if (flashTimeout.current) clearTimeout(flashTimeout.current);
    flashTimeout.current = setTimeout(() => {
      document.body.classList.remove("flash");
    }, FLASH_MS);
  }, []);

  const mergeCooldownUntil = useCallback((serverUntil: unknown) => {
    const until = toMs(serverUntil);
    const now = Date.now();
    setCooldownEndsAt((prev) => {
      if (until > now) return Math.max(prev, until);
      if (prev > now) return prev;
      return 0;
    });
  }, []);

  const applyVersion = useCallback(
    (version: unknown, shouldFlash: boolean) => {
      const v = toMs(version);
      if (v <= 0) return;

      const prev = lastSeenVersion.current;
      if (prev === 0) {
        lastSeenVersion.current = v;
        writeStoredVersion(v);
        return;
      }

      if (v > prev) {
        lastSeenVersion.current = v;
        writeStoredVersion(v);
        if (shouldFlash) flash();
      }
    },
    [flash],
  );

  useEffect(() => {
    lastSeenVersion.current = readStoredVersion();
  }, []);

  useEffect(() => {
    const tick = () => {
      setCooldownMs(Math.max(0, cooldownEndsAt - Date.now()));
    };
    tick();
    const id = setInterval(tick, TICK_MS);
    return () => clearInterval(id);
  }, [cooldownEndsAt]);

  useEffect(() => {
    let cancelled = false;

    async function pollOnce() {
      const seq = ++pollSeq.current;
      try {
        const res = await fetch(`/api/signal?t=${Date.now()}`, {
          cache: "no-store",
          headers: { Pragma: "no-cache" },
        });
        if (!res.ok || cancelled || seq !== pollSeq.current) return;

        const body = (await res.json()) as SignalResponse;
        if (cancelled || seq !== pollSeq.current) return;

        mergeCooldownUntil(body.cooldownUntil);
        applyVersion(body.version, true);
      } catch {
        /* retry on next tick */
      }
    }

    async function poll() {
      while (!cancelled) {
        await pollOnce();
        await new Promise((r) => setTimeout(r, POLL_MS));
      }
    }

    poll();

    const onVisible = () => {
      if (document.visibilityState === "visible") pollOnce();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      if (flashTimeout.current) clearTimeout(flashTimeout.current);
    };
  }, [applyVersion, mergeCooldownUntil]);

  async function onPush() {
    if (onCooldown) return;
    setSending(true);
    try {
      const res = await fetch("/api/signal", {
        method: "POST",
        cache: "no-store",
      });
      const body = (await res.json()) as SignalResponse;
      mergeCooldownUntil(body.cooldownUntil);
      applyVersion(body.version, res.ok);
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="page">
      <div className="push-area">
        {onCooldown && (
          <p className="cooldown-timer" aria-live="polite">
            {formatCooldown(cooldownMs)}
          </p>
        )}
        <button
          type="button"
          onClick={onPush}
          disabled={sending || onCooldown}
        >
          Push
        </button>
      </div>
    </main>
  );
}
