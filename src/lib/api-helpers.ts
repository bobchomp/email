import { NextResponse } from "next/server";
import { ReconnectRequiredError } from "./google-oauth";

export async function withGmailErrorHandling<T>(
  fn: () => Promise<T>
): Promise<NextResponse> {
  try {
    const data = await fn();
    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof ReconnectRequiredError) {
      return NextResponse.json({ error: "reconnect_required" }, { status: 409 });
    }
    console.error(err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
