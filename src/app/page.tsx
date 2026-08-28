import { redirect } from "next/navigation";
import { getGoogleAccount } from "@/lib/db";

export const dynamic = "force-dynamic";

// Reached only once the PIN middleware has let a request through. From here
// we just decide whether Google still needs to be connected.
export default async function Home() {
  const account = await getGoogleAccount();
  redirect(account ? "/inbox" : "/connect");
}
