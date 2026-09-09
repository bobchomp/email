export type EmailAddress = { name: string; email: string };

export function parseAddressList(raw: string | undefined | null): EmailAddress[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const match = part.match(/^"?([^"<]*)"?\s*<([^>]+)>$/);
      if (match) {
        return { name: match[1].trim(), email: match[2].trim() };
      }
      return { name: "", email: part };
    });
}

export function formatAddress(a: EmailAddress): string {
  return a.name ? `${a.name} <${a.email}>` : a.email;
}

export function formatAddressList(list: EmailAddress[]): string {
  return list.map(formatAddress).join(", ");
}

export function dedupeAddresses(list: EmailAddress[]): EmailAddress[] {
  const seen = new Set<string>();
  const result: EmailAddress[] = [];
  for (const a of list) {
    const key = a.email.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(a);
    }
  }
  return result;
}
