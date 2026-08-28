import { NextResponse } from "next/server";
import { getGoogleAccount } from "@/lib/db";

export async function GET() {
  const account = await getGoogleAccount();
  return NextResponse.json({
    connected: !!account,
    email: account?.email ?? null,
  });
}
