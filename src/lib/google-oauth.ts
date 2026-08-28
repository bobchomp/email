import { google } from "googleapis";
import { GMAIL_SCOPES } from "./constants";

export class ReconnectRequiredError extends Error {
  constructor() {
    super("Google connection expired or was revoked — reconnect required");
    this.name = "ReconnectRequiredError";
  }
}

function baseUrl(): string {
  const url = process.env.APP_BASE_URL;
  if (!url) {
    throw new Error("APP_BASE_URL environment variable is not set");
  }
  return url.replace(/\/$/, "");
}

export function getRedirectUri(): string {
  return `${baseUrl()}/api/auth/google/callback`;
}

export function createOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET environment variables are not set"
    );
  }
  return new google.auth.OAuth2(clientId, clientSecret, getRedirectUri());
}

export function buildAuthUrl(): string {
  const client = createOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // forces a refresh_token every time, including on reconnect
    scope: GMAIL_SCOPES,
  });
}

export async function exchangeCodeForTokens(code: string) {
  const client = createOAuthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error(
      "Google did not return a refresh token. Revoke the app's access at " +
        "https://myaccount.google.com/permissions and try connecting again " +
        "(this happens if you've connected before without revoking first)."
    );
  }
  client.setCredentials(tokens);
  let email: string | null = null;
  try {
    const oauth2 = google.oauth2({ auth: client, version: "v2" });
    const info = await oauth2.userinfo.get();
    email = info.data.email ?? null;
  } catch {
    // Non-fatal — email is only used for display purposes.
  }
  return { refreshToken: tokens.refresh_token, email };
}

// Wraps googleapis errors that indicate the refresh token is dead
// (revoked, or expired after Google's 7-day unverified-app limit).
export function isReconnectRequiredError(err: unknown): boolean {
  const e = err as { code?: number; response?: { data?: { error?: string } }; message?: string };
  const errorCode = e?.response?.data?.error;
  if (errorCode === "invalid_grant") return true;
  if (e?.code === 401) return true;
  if (typeof e?.message === "string" && e.message.includes("invalid_grant")) {
    return true;
  }
  return false;
}
