"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const POLL_MS = 400;
const FLASH_MS = 600;

export default function Home() {
  const [sending, setSending] = useState(false);
  const lastSeen = useRef(0);
  const flashTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback(() => {
    document.body.classList.add("flash");
    if (flashTimeout.current) clearTimeout(flashTimeout.current);
    flashTimeout.current = setTimeout(() => {
      document.body.classList.remove("flash");
    }, FLASH_MS);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      while (!cancelled) {
        try {
          const res = await fetch("/api/signal", { cache: "no-store" });
          if (res.ok) {
            const { signal } = (await res.json()) as { signal: number };
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
    setSending(true);
    try {
      const res = await fetch("/api/signal", { method: "POST" });
      if (res.ok) {
        const { signal } = (await res.json()) as { signal: number };
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
      <button type="button" onClick={onPush} disabled={sending}>
        Push
      </button>
    </main>
  );
}
