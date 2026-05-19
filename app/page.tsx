"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const POLL_MS = 300;
const FLASH_MS = 600;
const TICK_MS = 250;
/** Ignore cooldownUntil moves smaller than this (clock skew / jitter). */
const COOLDOWN_JUMP_MS = 2_000;

type SignalResponse = {
  version: number;
  cooldownUntil: number;
  cooldownRemainingMs?: number;
};

function toNum(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toPositiveMs(value: unknown): number {
  const n = toNum(value);
  return n > 0 ? n : 0;
}

function formatCooldown(ms: number): string {
  const totalSec = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export default function Home() {
  const [sending, setSending] = useState(false);
  const [cooldownEndsAt, setCooldownEndsAt] = useState(0);
  const [cooldownMs, setCooldownMs] = useState(0);
  const lastSeenVersion = useRef(0);
  const lastSeenCooldownUntil = useRef(0);
  const synced = useRef(false);
  const flashTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onCooldown = cooldownMs > 0;

  const flash = useCallback(() => {
    document.body.classList.add("flash");
    if (flashTimeout.current) clearTimeout(flashTimeout.current);
    flashTimeout.current = setTimeout(() => {
      document.body.classList.remove("flash");
    }, FLASH_MS);
  }, []);

  const mergeCooldownUntil = useCallback((serverUntil: unknown) => {
    const until = toPositiveMs(serverUntil);
    const now = Date.now();
    setCooldownEndsAt((prev) => {
      if (until > now) return Math.max(prev, until);
      if (prev > now) return prev;
      return 0;
    });
  }, []);

  const applyServerState = useCallback(
    (body: SignalResponse, allowFlash: boolean) => {
      const v = toNum(body.version);
      const until = toPositiveMs(body.cooldownUntil);
      const now = Date.now();

      mergeCooldownUntil(until);

      if (!synced.current) {
        lastSeenVersion.current = v;
        lastSeenCooldownUntil.current = until;
        synced.current = true;
        return;
      }

      const versionBumped = v > lastSeenVersion.current;
      const newCooldownWindow =
        until > now && until > lastSeenCooldownUntil.current + COOLDOWN_JUMP_MS;

      if (allowFlash && (versionBumped || newCooldownWindow)) {
        flash();
      }

      if (v > lastSeenVersion.current) lastSeenVersion.current = v;
      if (until > lastSeenCooldownUntil.current) {
        lastSeenCooldownUntil.current = until;
      }
    },
    [flash, mergeCooldownUntil],
  );

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
      try {
        const res = await fetch(`/api/signal?t=${Date.now()}`, {
          cache: "no-store",
          headers: { Pragma: "no-cache" },
        });
        if (!res.ok || cancelled) return;
        const body = (await res.json()) as SignalResponse;
        if (cancelled) return;
        applyServerState(body, true);
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
  }, [applyServerState]);

  async function onPush() {
    if (onCooldown) return;
    setSending(true);
    try {
      const res = await fetch("/api/signal", {
        method: "POST",
        cache: "no-store",
      });
      const body = (await res.json()) as SignalResponse;
      if (res.ok) {
        applyServerState(body, false);
        flash();
      } else {
        applyServerState(body, false);
      }
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
