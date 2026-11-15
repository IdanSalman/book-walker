"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

import { AnimatedSwitch } from "@/components/animated-switch";
import {
  libraryCaughtUpCookieHeader,
  type LibraryCaughtUpMode,
} from "@/lib/library-caught-up-view";

type LibraryCaughtUpContextValue = {
  onlyCaughtUp: boolean;
  setOnlyCaughtUp: (only: boolean) => void;
};

const LibraryCaughtUpContext =
  createContext<LibraryCaughtUpContextValue | null>(null);

export function LibraryCaughtUpProvider({
  initialOnlyCaughtUp,
  children,
}: {
  initialOnlyCaughtUp: boolean;
  children: ReactNode;
}) {
  const [onlyCaughtUp, setOnlyCaughtUpState] = useState(initialOnlyCaughtUp);

  const setOnlyCaughtUp = useCallback((only: boolean) => {
    const mode: LibraryCaughtUpMode = only ? "only" : "reading";
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${libraryCaughtUpCookieHeader(mode)}${secure}`;
    setOnlyCaughtUpState(only);
  }, []);

  return (
    <LibraryCaughtUpContext.Provider value={{ onlyCaughtUp, setOnlyCaughtUp }}>
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
  const { onlyCaughtUp, setOnlyCaughtUp } = useLibraryCaughtUp();

  return (
    <div className="inline-flex items-center gap-2.5 rounded-full border border-zinc-800 bg-zinc-900/60 py-1 pl-3 pr-1.5">
      <button
        type="button"
        className="cursor-pointer text-sm text-zinc-200"
        onClick={() => setOnlyCaughtUp(!onlyCaughtUp)}
      >
        No new chapters
      </button>
      <span className="text-xs text-zinc-500" aria-hidden>
        {onlyCaughtUp ? "Only" : "Off"}
      </span>
      <AnimatedSwitch
        checked={onlyCaughtUp}
        aria-label="Show only titles with no new chapters"
        onCheckedChange={setOnlyCaughtUp}
      />
    </div>
  );
}
