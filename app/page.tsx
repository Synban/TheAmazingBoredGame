"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const POLL_MS = 400;
const FLASH_MS = 600;
const TICK_MS = 250;

type SignalResponse = {
  signal: number;
  cooldownRemainingMs: number;
};

function normalizeCooldownMs(value: unknown): number {
  const ms = typeof value === "number" ? value : Number(value);
  return Number.isFinite(ms) && ms > 0 ? ms : 0;
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
  const lastSeen = useRef(0);
  const flashTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onCooldown = cooldownMs > 0;

  const flash = useCallback(() => {
    document.body.classList.add("flash");
    if (flashTimeout.current) clearTimeout(flashTimeout.current);
    flashTimeout.current = setTimeout(() => {
      document.body.classList.remove("flash");
    }, FLASH_MS);
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

    function applyCooldown(remainingMs: unknown) {
      const ms = normalizeCooldownMs(remainingMs);
      if (ms > 0) {
        setCooldownEndsAt(Date.now() + ms);
      } else {
        setCooldownEndsAt(0);
      }
    }

    async function poll() {
      while (!cancelled) {
        try {
          const res = await fetch("/api/signal", { cache: "no-store" });
          if (res.ok) {
            const { signal, cooldownRemainingMs } =
              (await res.json()) as SignalResponse;
            applyCooldown(cooldownRemainingMs);
            if (signal > 0) {
              if (lastSeen.current === 0) {
                lastSeen.current = signal;
              } else if (signal > lastSeen.current) {
                lastSeen.current = signal;
                flash();
              }
            }
          }
        } catch {
          /* retry on next tick */
        }
        await new Promise((r) => setTimeout(r, POLL_MS));
      }
    }

    poll();
    return () => {
      cancelled = true;
      if (flashTimeout.current) clearTimeout(flashTimeout.current);
    };
  }, [flash]);

  async function onPush() {
    if (onCooldown) return;
    setSending(true);
    try {
      const res = await fetch("/api/signal", { method: "POST" });
      const body = (await res.json()) as SignalResponse;
      const remaining = normalizeCooldownMs(body.cooldownRemainingMs);
      if (remaining > 0) {
        setCooldownEndsAt(Date.now() + remaining);
      }
      if (res.ok) {
        const { signal } = body;
        if (signal > lastSeen.current) {
          lastSeen.current = signal;
          flash();
        }
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
