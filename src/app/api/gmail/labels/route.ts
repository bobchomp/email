import { NextRequest } from "next/server";
import { createLabel, listLabels } from "@/lib/gmail";
import { withGmailErrorHandling } from "@/lib/api-helpers";

export async function GET() {
  return withGmailErrorHandling(async () => ({ labels: await listLabels() }));
}

// Creates a folder from the "Add to folder" popup.
export async function POST(req: NextRequest) {
  const body = (await req.json()) as { name?: unknown };
  return withGmailErrorHandling(async () => {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 225 || /[\x00-\x1f]/.test(name)) {
      throw new Error("Folder names must be 1–225 characters");
    }
    return { label: await createLabel(name) };
  });
}
