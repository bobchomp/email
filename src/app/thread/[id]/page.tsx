import { redirect } from "next/navigation";
import { getGoogleAccount } from "@/lib/db";
import ThreadClient from "./ThreadClient";

export const dynamic = "force-dynamic";

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const account = await getGoogleAccount();
  if (!account) redirect("/connect");

  const { id } = await params;
  return <ThreadClient threadId={id} />;
}
