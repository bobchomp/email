import type { Metadata } from "next";

// Deliberately without the account email: this page is shown before the PIN.
export const metadata: Metadata = { title: "Unlock" };

export default function UnlockLayout({ children }: { children: React.ReactNode }) {
  return children;
}
