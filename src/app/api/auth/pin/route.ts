import { NextRequest, NextResponse } from "next/server";
import { checkPin } from "@/lib/pin";
import { createSessionToken } from "@/lib/session";
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/lib/constants";

export async function POST(req: NextRequest) {
  let body: { pin?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const pin = typeof body.pin === "string" ? body.pin : "";
  if (!pin) {
    return NextResponse.json({ error: "PIN is required" }, { status: 400 });
  }

  let result;
  try {
    result = await checkPin(pin);
  } catch (err) {
    console.error("PIN check failed:", err);
    return NextResponse.json(
      {
        error: "server_error",
        message: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }

  if (!result.ok) {
    if (result.locked) {
      return NextResponse.json(
        { error: "locked", retryAfterSeconds: result.retryAfterSeconds },
        { status: 429 }
      );
    }
    return NextResponse.json(
      { error: "incorrect", attemptsRemaining: result.attemptsRemaining },
      { status: 401 }
    );
  }

  const token = await createSessionToken();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
  });
  return res;
}
