export const SESSION_COOKIE = "email_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 180; // 180 days

// Full Gmail access: read, modify, send, permanently delete.
export const GMAIL_SCOPES = [
  "https://mail.google.com/",
  "openid",
  "email",
];

export const PIN_MAX_ATTEMPTS_BEFORE_LOCK = 5;
export const PIN_BASE_LOCKOUT_SECONDS = 5 * 60; // 5 minutes
export const PIN_MAX_LOCKOUT_SECONDS = 24 * 60 * 60; // 24 hours
