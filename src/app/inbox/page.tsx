import { redirect } from "next/navigation";
import { getGoogleAccount } from "@/lib/db";
import InboxClient from "./InboxClient";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const account = await getGoogleAccount();
  if (!account) redirect("/connect");

  return <InboxClient accountEmail={account.email} />;
}
