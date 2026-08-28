import { timingSafeEqual } from "./crypto";
import { getPinAttemptState, savePinAttemptState } from "./db";
import {
  PIN_BASE_LOCKOUT_SECONDS,
  PIN_MAX_ATTEMPTS_BEFORE_LOCK,
  PIN_MAX_LOCKOUT_SECONDS,
} from "./constants";
import { sendLockoutAlert } from "./gmail";

export type PinCheckResult =
  | { ok: true }
  | { ok: false; locked: true; retryAfterSeconds: number }
  | { ok: false; locked: false; attemptsRemaining: number };

export async function checkPin(submitted: string): Promise<PinCheckResult> {
  const expected = process.env.APP_PIN;
  if (!expected) {
    throw new Error("APP_PIN environment variable is not set");
  }

  const state = await getPinAttemptState();
  const now = new Date();

  if (state.lockedUntil && state.lockedUntil > now) {
    const retryAfterSeconds = Math.ceil(
      (state.lockedUntil.getTime() - now.getTime()) / 1000
    );
    return { ok: false, locked: true, retryAfterSeconds };
  }

  const correct = timingSafeEqual(submitted, expected);

  if (correct) {
    await savePinAttemptState({
      failedCount: 0,
      lockedUntil: null,
      lastLockoutSeconds: 0,
    });
    return { ok: true };
  }

  const failedCount = state.failedCount + 1;

  if (failedCount >= PIN_MAX_ATTEMPTS_BEFORE_LOCK) {
    const lockoutSeconds = Math.min(
      state.lastLockoutSeconds > 0
        ? state.lastLockoutSeconds * 2
        : PIN_BASE_LOCKOUT_SECONDS,
      PIN_MAX_LOCKOUT_SECONDS
    );
    const lockedUntil = new Date(now.getTime() + lockoutSeconds * 1000);
    await savePinAttemptState({
      failedCount,
      lockedUntil,
      lastLockoutSeconds: lockoutSeconds,
    });
    sendLockoutAlert(lockoutSeconds).catch(() => {
      // Best-effort — a failed alert email must never block the lockout itself.
    });
    return { ok: false, locked: true, retryAfterSeconds: lockoutSeconds };
  }

  await savePinAttemptState({
    failedCount,
    lockedUntil: null,
    lastLockoutSeconds: state.lastLockoutSeconds,
  });
  return {
    ok: false,
    locked: false,
    attemptsRemaining: PIN_MAX_ATTEMPTS_BEFORE_LOCK - failedCount,
  };
}
