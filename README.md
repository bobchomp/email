# Mail

A private, single-user Gmail web client: sign in with Google once, then unlock
it from any device with just a PIN. Every action you take (archive, delete,
star, send, reply) happens for real in your Gmail account via the Gmail API —
nothing is a local copy.

## How it works

- **First-time setup**: visit the app, enter your PIN (set by you as an
  env var), then click "Sign in with Google" once. This grants the app full
  access to your Gmail account and stores an encrypted refresh token in a
  small Postgres database.
- **Every other visit, from any device/browser**: just the PIN. A signed,
  long-lived cookie remembers that device once you've entered it correctly.
- Because your Google Cloud OAuth app isn't (and, realistically, can't
  easily be) verified by Google for a single personal account, Google will
  invalidate the connection roughly every **7 days**. The app detects this
  automatically and shows a one-click "Reconnect Google" screen — your PIN
  and everything else stay as they are.
- The PIN is protected with a lockout: 5 wrong attempts in a row locks it out
  (5 minutes, doubling on each further failure, capped at 24h), and
  optionally emails you an alert (see `ALERT_EMAIL` below).

## What it can't do (by design, for now)

- No attachments (viewing or sending). Everything else — read, search,
  archive, star, label, permanently delete, send, reply, forward — works.
- No support for multiple Gmail accounts or multiple users; this is a
  personal single-account tool, not a multi-tenant product.

---

## 1. Set up Google Cloud (required before anything else works)

1. Go to [console.cloud.google.com](https://console.cloud.google.com/) and
   create a new project (or pick an existing one).
2. **Enable the Gmail API**: APIs & Services → Library → search "Gmail API"
   → Enable.
3. **Configure the OAuth consent screen**: APIs & Services → OAuth consent
   screen.
   - User type: **External** (a plain @gmail.com account can't use
     "Internal", which is Workspace-only).
   - Fill in the required app name/support email fields with anything
     reasonable.
   - Scopes: add `https://mail.google.com/` (full Gmail access).
   - **Test users**: add your own Gmail address here. This is what lets you
     use the app without going through Google's full verification review.
   - Leave publishing status as **Testing**. (See the note on the 7-day
     limit above — this is the tradeoff for skipping Google's review
     process, which requires a public privacy policy and, for this scope,
     likely a CASA security assessment.)
4. **Create credentials**: APIs & Services → Credentials → Create Credentials
   → OAuth client ID → Application type: **Web application**.
   - Authorized redirect URI: `https://<your-vercel-domain>/api/auth/google/callback`
     (and, for local dev, also add `http://localhost:3000/api/auth/google/callback`).
   - Save the **Client ID** and **Client Secret** — you'll need them below.

## 2. Set up the database

Any Postgres works. The easiest path on Vercel: Project → Storage → create a
Postgres database (Neon-backed) → it gives you a `DATABASE_URL`. The app
creates its own tables automatically on first use — no migration step needed.

## 3. Environment variables

Copy `.env.example` to `.env.local` for local dev, and set the same values
in your Vercel project's Settings → Environment Variables for production.

| Variable | Where it comes from |
|---|---|
| `APP_BASE_URL` | Your deployed URL, e.g. `https://your-app.vercel.app` (no trailing slash) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | From step 1 |
| `DATABASE_URL` | From step 2 |
| `SESSION_SECRET` | Random string — generate with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `ENCRYPTION_KEY` | Random 32-byte base64 key — generate the same way as above |
| `APP_PIN` | Whatever PIN you want to type to unlock the app (digits only) |
| `ALERT_EMAIL` | Optional — your own email, to get notified on PIN lockouts |

## 4. Deploy

```bash
npm install
```

Push this repo to Vercel (or run `vercel` from the CLI) and set the
environment variables above in the project settings. Vercel will build and
deploy automatically.

## 5. First run

1. Open the deployed URL. You'll land on the PIN screen — enter the `APP_PIN`
   you set.
2. You'll be sent to "Connect your Gmail account" — click **Sign in with
   Google**, and approve access. Because the app is in Testing mode, Google
   will show an "unverified app" warning screen first — click **Advanced →
   Go to (your app) (unsafe)** to proceed. This is expected for a personal
   tool that hasn't gone through Google's formal review.
3. You're in. From now on, any device just needs the PIN.

## Local development

```bash
cp .env.example .env.local   # fill in the values
npm run dev
```

You'll need a real (or local) Postgres instance and real Google OAuth
credentials with `http://localhost:3000/api/auth/google/callback` as an
authorized redirect URI for the Google sign-in step to work locally.

## Security notes

- The Google refresh token is encrypted at rest (AES-256-GCM) using
  `ENCRYPTION_KEY`, and is never sent to the browser — all Gmail API calls
  happen server-side.
- The PIN is compared with a constant-time check and is never logged.
- Because a single global PIN grants full Gmail access from any device that
  knows it, treat it like a password: don't reuse a PIN from elsewhere, and
  don't share the deployed URL publicly.
- If you ever suspect the PIN has leaked, change `APP_PIN` in your
  environment variables and redeploy — that immediately invalidates the old
  PIN. Existing unlocked-device sessions remain valid until they expire
  (180 days) or you revoke them by rotating `SESSION_SECRET`, which
  immediately signs everyone out everywhere.
