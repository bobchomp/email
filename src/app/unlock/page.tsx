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
      } else if (res.status === 401) {
        setError(
          data.attemptsRemaining !== undefined
            ? `Incorrect PIN. ${data.attemptsRemaining} attempt(s) left.`
            : "Incorrect PIN."
        );
      } else {
        setError(
          `Server error, this isn't a wrong PIN — check your deployment's environment variables. (${data.message ?? res.status})`
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
    <div className="flex flex-1 items-center justify-center bg-paper px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl border border-line bg-surface p-8 shadow-sm flex flex-col gap-5"
      >
        <div className="text-center">
          <h1 className="text-xl font-semibold text-body">Enter PIN</h1>
          <p className="mt-1 text-sm text-muted">Unlock to access your mail</p>
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
          className="w-full rounded-lg border border-line bg-transparent px-4 py-3 text-center text-2xl tracking-[0.5em] text-body outline-none focus:border-ink disabled:opacity-50"
          placeholder="••••••"
        />

        {error && (
          <p className="text-sm text-seal-deep text-center">
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
          className="w-full rounded-full bg-ink text-white py-3 font-medium disabled:opacity-40"
        >
          {submitting ? "Checking…" : "Unlock"}
        </button>
      </form>
    </div>
  );
}
