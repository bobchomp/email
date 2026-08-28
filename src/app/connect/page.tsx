import { getGoogleAccount } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ConnectPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; reason?: string }>;
}) {
  const { error, reason } = await searchParams;
  const account = await getGoogleAccount();

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 dark:bg-black px-4">
      <div className="w-full max-w-sm rounded-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-zinc-950 p-8 shadow-sm flex flex-col gap-5 text-center">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            {account ? "Reconnect Google" : "Connect your Gmail account"}
          </h1>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            {account
              ? `Your connection to ${account.email ?? "Google"} needs to be renewed. This happens roughly every 7 days because the app isn't verified by Google — it takes one click.`
              : "Sign in with Google once. After this, you'll only need your PIN to get back in from any device."}
          </p>
        </div>

        {reason === "expired" && (
          <p className="text-sm text-amber-600 dark:text-amber-400">
            Your Google connection expired — please reconnect.
          </p>
        )}
        {error && (
          <p className="text-sm text-red-600 dark:text-red-400 break-words">
            {decodeURIComponent(error)}
          </p>
        )}

        <a
          href="/api/auth/google/start"
          className="w-full rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 py-3 font-medium inline-flex items-center justify-center gap-2"
        >
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
            <path
              fill="#FFC107"
              d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z"
            />
            <path
              fill="#FF3D00"
              d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4c-7.4 0-13.8 4.2-17.1 10.3z"
            />
            <path
              fill="#4CAF50"
              d="M24 44c5.5 0 10.4-1.9 14.3-5.1l-6.6-5.6c-2 1.5-4.6 2.6-7.7 2.6-5.2 0-9.6-3.3-11.3-7.9l-6.6 5.1C9.9 39.6 16.4 44 24 44z"
            />
            <path
              fill="#1976D2"
              d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4.1 5.6l6.6 5.6C41.4 36.4 44 30.7 44 24c0-1.3-.1-2.7-.4-3.5z"
            />
          </svg>
          Sign in with Google
        </a>

        <p className="text-xs text-zinc-400">
          Grants full Gmail access (read, send, delete) so this app can act on
          your real inbox.
        </p>
      </div>
    </div>
  );
}
