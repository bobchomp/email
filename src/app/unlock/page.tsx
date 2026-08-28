"use client";

import { useState, useRef, FormEvent, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function UnlockPage() {
  return (
    <Suspense>
      <UnlockForm />
    </Suspense>
  );
}

function UnlockForm() {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [lockedSeconds, setLockedSeconds] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!pin || submitting) return;
    setSubmitting(true);
    setError(null);
    setLockedSeconds(null);

    try {
      const res = await fetch("/api/auth/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });

      if (res.ok) {
        const next = searchParams.get("next") || "/";
        router.push(next);
        router.refresh();
        return;
      }

      const data = await res.json().catch(() => ({}));
      if (res.status === 429) {
        setLockedSeconds(data.retryAfterSeconds ?? null);
        setError("Too many wrong attempts. Locked for now.");
      } else {
        setError(
          data.attemptsRemaining !== undefined
            ? `Incorrect PIN. ${data.attemptsRemaining} attempt(s) left.`
            : "Incorrect PIN."
        );
      }
      setPin("");
      inputRef.current?.focus();
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 dark:bg-black px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-zinc-950 p-8 shadow-sm flex flex-col gap-5"
      >
        <div className="text-center">
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            Enter PIN
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Unlock to access your mail
          </p>
        </div>

        <input
          ref={inputRef}
          type="password"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          maxLength={12}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, ""))}
          disabled={lockedSeconds !== null}
          className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent px-4 py-3 text-center text-2xl tracking-[0.5em] text-zinc-900 dark:text-zinc-50 outline-none focus:border-zinc-500 disabled:opacity-50"
          placeholder="••••••"
        />

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400 text-center">
            {error}
            {lockedSeconds !== null && (
              <>
                {" "}
                Try again in {Math.ceil(lockedSeconds / 60)} minute(s).
              </>
            )}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting || !pin || lockedSeconds !== null}
          className="w-full rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 py-3 font-medium disabled:opacity-40"
        >
          {submitting ? "Checking…" : "Unlock"}
        </button>
      </form>
    </div>
  );
}
