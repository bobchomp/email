"use client";

import { useEffect } from "react";

// Browser tab titles read "<page> | <account email>", so several open tabs
// (and several accounts) can be told apart at a glance.
export function tabTitle(page: string, accountEmail: string | null): string {
  return accountEmail ? `${page} | ${accountEmail}` : page;
}

// Set from the client because the title depends on state that changes
// without a navigation (the open folder, a search, a thread's subject once
// it has loaded).
export function useTabTitle(title: string): void {
  useEffect(() => {
    document.title = title;
  }, [title]);
}
