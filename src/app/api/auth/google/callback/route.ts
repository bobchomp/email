import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens } from "@/lib/google-oauth";
import { encryptSecret } from "@/lib/crypto";
import { saveGoogleAccount } from "@/lib/db";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");

  if (error) {
    const url = req.nextUrl.clone();
    url.pathname = "/connect";
    url.searchParams.set("error", error);
    return NextResponse.redirect(url);
  }

  if (!code) {
    const url = req.nextUrl.clone();
    url.pathname = "/connect";
    url.searchParams.set("error", "missing_code");
    return NextResponse.redirect(url);
  }

  try {
    const { refreshToken, email } = await exchangeCodeForTokens(code);
    await saveGoogleAccount(email, encryptSecret(refreshToken));
  } catch (err) {
    const url = req.nextUrl.clone();
    url.pathname = "/connect";
    url.searchParams.set(
      "error",
      err instanceof Error ? err.message : "exchange_failed"
    );
    return NextResponse.redirect(url);
  }

  const url = req.nextUrl.clone();
  url.pathname = "/inbox";
  url.search = "";
  return NextResponse.redirect(url);
}
