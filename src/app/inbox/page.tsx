import { redirect } from "next/navigation";
import { getGoogleAccount } from "@/lib/db";
import InboxClient from "./InboxClient";

export const dynamic = "force-dynamic";

function firstString(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const account = await getGoogleAccount();
  if (!account) redirect("/connect");

  // The open folder and search live in the URL, so coming back from an
  // email (or reloading) returns to the same list.
  const params = await searchParams;
  return (
    <InboxClient
      accountEmail={account.email}
      initialFolderKey={firstString(params.folder)}
      initialQuery={firstString(params.q)}
    />
  );
}
