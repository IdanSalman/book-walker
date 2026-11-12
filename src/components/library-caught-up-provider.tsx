"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

import { AnimatedSwitch } from "@/components/animated-switch";
import { hideCaughtUpCookieHeader } from "@/lib/library-caught-up-view";

type LibraryCaughtUpContextValue = {
  hideCaughtUp: boolean;
  setHideCaughtUp: (hide: boolean) => void;
};

const LibraryCaughtUpContext =
  createContext<LibraryCaughtUpContextValue | null>(null);

export function LibraryCaughtUpProvider({
  initialHideCaughtUp,
  children,
}: {
  initialHideCaughtUp: boolean;
  children: ReactNode;
}) {
  const [hideCaughtUp, setHideCaughtUpState] = useState(initialHideCaughtUp);

  const setHideCaughtUp = useCallback((hide: boolean) => {
    const secure =
      window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${hideCaughtUpCookieHeader(hide)}${secure}`;
    setHideCaughtUpState(hide);
  }, []);

  return (
    <LibraryCaughtUpContext.Provider value={{ hideCaughtUp, setHideCaughtUp }}>
      {children}
    </LibraryCaughtUpContext.Provider>
  );
}

export function useLibraryCaughtUp(): LibraryCaughtUpContextValue {
  const value = useContext(LibraryCaughtUpContext);
  if (!value) {
    throw new Error("useLibraryCaughtUp must be used within LibraryCaughtUpProvider");
  }
  return value;
}

export function LibraryCaughtUpToggle() {
  const { hideCaughtUp, setHideCaughtUp } = useLibraryCaughtUp();
  const shown = !hideCaughtUp;

  return (
    <div className="inline-flex items-center gap-2.5 rounded-full border border-zinc-800 bg-zinc-900/60 py-1 pl-3 pr-1.5">
      <button
        type="button"
        className="cursor-pointer text-sm text-zinc-200"
        onClick={() => setHideCaughtUp(!hideCaughtUp)}
      >
        No new chapters
      </button>
      <span className="text-xs text-zinc-500" aria-hidden>
        {shown ? "Shown" : "Hidden"}
      </span>
      <AnimatedSwitch
        checked={shown}
        aria-label="Show titles with no new chapters"
        onCheckedChange={(next) => setHideCaughtUp(!next)}
      />
    </div>
  );
}
