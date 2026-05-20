"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  countWords,
  isBoredReasonValid,
  MAX_REASON_CHARS,
  MIN_REASON_CHARS,
  MIN_REASON_WORDS,
  normalizeReason,
} from "@/lib/bored-reason";

const POLL_MS = 300;
const FLASH_MS = 600;
const TICK_MS = 250;
/** Ignore cooldownUntil moves smaller than this (clock skew / jitter). */
const COOLDOWN_JUMP_MS = 2_000;

type SignalResponse = {
  version: number;
  cooldownUntil: number;
  cooldownRemainingMs?: number;
  currentWord?: string;
  currentReason?: string;
  message?: string;
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
  const [currentWord, setCurrentWord] = useState("");
  const [displayReason, setDisplayReason] = useState("");
  const [reasonDraft, setReasonDraft] = useState("");
  const [validationMessage, setValidationMessage] = useState("");
  const lastSeenVersion = useRef(0);
  const lastSeenCooldownUntil = useRef(0);
  const synced = useRef(false);
  const flashTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onCooldown = cooldownMs > 0;
  const draftNormalized = normalizeReason(reasonDraft);
  const draftWords = countWords(reasonDraft);
  const draftChars = draftNormalized.length;
  const reasonValid = isBoredReasonValid(reasonDraft);
  const canPush = reasonValid && !onCooldown && !sending;

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

      if (typeof body.currentWord === "string" && body.currentWord) {
        setCurrentWord(body.currentWord);
      }

      if (typeof body.currentReason === "string") {
        setDisplayReason(body.currentReason);
      }

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
    if (!canPush) return;
    setSending(true);
    setValidationMessage("");
    try {
      const res = await fetch("/api/signal", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reasonDraft }),
      });
      const body = (await res.json()) as SignalResponse;
      applyServerState(body, false);

      if (res.ok) {
        flash();
        setReasonDraft("");
      } else if (res.status === 400 && body.message) {
        setValidationMessage(body.message);
      }
    } finally {
      setSending(false);
    }
  }

  const wordLabel = currentWord || "—";
  const reasonLabel = displayReason || "—";

  return (
    <main className="page">
      <h1 className="title">
        The Amazing <span className="title-bored">BORED</span> Game
      </h1>
      <div className="push-area">
        <section className="reason-display" aria-live="polite">
          <h2 className="reason-display-label">Reason they&apos;re bored</h2>
          <p className="reason-display-text">{reasonLabel}</p>
        </section>

        <p className="current-word">
          Current Word: <span className="current-word-value">{wordLabel}</span>
        </p>

        <div className="reason-input-wrap">
          <label className="reason-input-label" htmlFor="bored-reason">
            Reason you&apos;re bored
          </label>
          <textarea
            id="bored-reason"
            className="reason-input"
            value={reasonDraft}
            onChange={(e) => {
              setReasonDraft(e.target.value);
              setValidationMessage("");
            }}
            disabled={sending || onCooldown}
            maxLength={MAX_REASON_CHARS}
            rows={4}
            placeholder="Tell everyone why you're bored…"
          />
          <p
            className={`reason-hint${reasonValid ? " reason-hint-valid" : ""}`}
          >
            {draftWords}/{MIN_REASON_WORDS} words · {draftChars}/{MIN_REASON_CHARS}{" "}
            characters
          </p>
          {validationMessage && (
            <p className="reason-error" role="alert">
              {validationMessage}
            </p>
          )}
        </div>

        {onCooldown && (
          <p className="cooldown-timer" aria-live="polite">
            {formatCooldown(cooldownMs)}
          </p>
        )}

        <button
          type="button"
          onClick={onPush}
          disabled={!canPush}
          aria-busy={sending || undefined}
        >
          I&apos;m Bored
        </button>
      </div>
    </main>
  );
}
