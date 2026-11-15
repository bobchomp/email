import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Mail",
};

const CONTACT = "info@rossmackenzie.co.uk";
const UPDATED = "15 November 2026";

export default function PrivacyPage() {
  return (
    <main className="flex-1 overflow-y-auto bg-paper px-4 py-10">
      <article className="mx-auto max-w-2xl rounded-2xl border border-line bg-surface px-6 py-8 text-sm leading-relaxed text-body sm:px-10">
        <h1 className="text-2xl font-semibold text-ink-deep">Privacy Policy</h1>
        <p className="mt-1 text-muted">Last updated {UPDATED}</p>

        <Section title="What this app is">
          Mail (email.rossmackenzie.co.uk) is a private, PIN-protected web client for a single
          Gmail account, run by Ross Mackenzie for personal use. It is not offered to the public.
        </Section>

        <Section title="Google data the app accesses">
          With your permission through Google sign-in, the app uses the Gmail API to read, search,
          send, label, archive, trash and delete your email, and reads your Google account email
          address to show which account is connected. It only does this when you use the app.
        </Section>

        <Section title="What is stored">
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              Your Google sign-in refresh token and account email address, kept in the app&apos;s
              database. The token is encrypted (AES-256-GCM).
            </li>
            <li>
              Which labels you have pinned, and counts of wrong PIN attempts for lockout protection.
            </li>
            <li>
              Files you attach while writing an email, held only until the email is sent (or deleted
              after 24 hours if it never is).
            </li>
            <li>
              In your own browser only: a short-lived cache of message lists (sender, subject,
              snippet, date) for speed, cleared when the browser tab session ends.
            </li>
          </ul>
          <p className="mt-2">
            Email contents are fetched from Gmail when you open them and are not stored on the
            app&apos;s servers.
          </p>
        </Section>

        <Section title="How the data is used and shared">
          Your data is used only to show you your email and carry out the actions you take in the
          app. It is not sold, not used for advertising, not used to train AI or machine-learning
          models, and not shared with anyone. The only other parties involved are the services that
          run the app: Google (Gmail), Vercel (hosting) and the app&apos;s database provider, which
          process data solely to operate it.
        </Section>

        <Section title="Google API Services User Data Policy">
          The app&apos;s use and transfer of information received from Google APIs adheres to the{" "}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            className="text-ink underline"
          >
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements.
        </Section>

        <Section title="Removing access and deleting data">
          You can disconnect the app at any time from your Google account at{" "}
          <a href="https://myaccount.google.com/permissions" className="text-ink underline">
            myaccount.google.com/permissions
          </a>
          , which stops all access immediately. To have the stored token and settings deleted, email{" "}
          <a href={`mailto:${CONTACT}`} className="text-ink underline">
            {CONTACT}
          </a>
          .
        </Section>

        <Section title="Security">
          The app is protected by a PIN, sessions use signed HTTP-only cookies, the stored Google
          token is encrypted, and all traffic is sent over HTTPS.
        </Section>

        <Section title="Changes and contact">
          Changes to this policy will be posted on this page. Questions:{" "}
          <a href={`mailto:${CONTACT}`} className="text-ink underline">
            {CONTACT}
          </a>
          .
        </Section>
      </article>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="text-base font-semibold text-ink-deep">{title}</h2>
      <div className="mt-1">{children}</div>
    </section>
  );
}
