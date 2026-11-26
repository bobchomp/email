"use client";

import { useEffect, useState } from "react";
import cover from "@/assets/cover.png";

const STORAGE_KEY = "mail:coverOn";
const TOGGLE_KEY = "`";

// A full-screen image over every page, toggled with the ` key. It stays on
// across pages and new tabs (session storage) until toggled off.
export default function CoverOverlay() {
  const [on, setOn] = useState(false);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- session storage is only readable in the browser
      setOn(sessionStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      // Storage unavailable: starts off.
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== TOGGLE_KEY || e.ctrlKey || e.metaKey || e.altKey) return;
      // Typing a ` into a text field (e.g. an email) shouldn't toggle it. The
      // PIN box is exempt: it's focused on the lock screen and ` means
      // nothing in a PIN.
      const target = e.target as HTMLElement | null;
      const isTextField =
        target &&
        (target.tagName === "TEXTAREA" ||
          target.isContentEditable ||
          (target instanceof HTMLInputElement && target.type !== "password"));
      if (isTextField) return;
      e.preventDefault();
      setOn((prev) => {
        const next = !prev;
        try {
          sessionStorage.setItem(STORAGE_KEY, next ? "1" : "0");
        } catch {
          // Not remembered across pages, still toggles here.
        }
        return next;
      });
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (!on) return null;
  return (
    // Above everything else in the app, including popups (z-50).
    <div className="fixed inset-0 z-[9999] bg-black" aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element -- plain full-screen cover, no optimisation needed */}
      <img src={cover.src} alt="" className="h-full w-full object-cover object-left-top" draggable={false} />
    </div>
  );
}
