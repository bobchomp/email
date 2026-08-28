import { NextResponse } from "next/server";
import { buildAuthUrl } from "@/lib/google-oauth";

export async function GET() {
  const url = buildAuthUrl();
  return NextResponse.redirect(url);
}
