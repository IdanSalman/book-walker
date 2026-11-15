"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import { CoverImage } from "@/components/cover-image";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { SUGGESTION_BATCH_SIZE } from "@/lib/suggestions/options";
import type { ContinueSuggestion } from "@/lib/suggestions/types";

const STORAGE_KEY = "book-walker-continue-suggestions";

let autoOpenDecided = false;
let autoOpenPending = false;

function alreadySeen(): boolean {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function markSeen() {
  try {
    sessionStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // Private browsing can reject storage. The button can still reopen it.
  }
}

export function ContinueSuggestions({
  suggestions,
}: {
  suggestions: ContinueSuggestion[];
}) {
  const [open, setOpen] = useState(false);
  const [offset, setOffset] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (suggestions.length === 0) return;
    // Remember the decision outside the component so React's dev remount
    // still opens the popup once, and a later visit in this tab does not.
    if (!autoOpenDecided) {
      autoOpenDecided = true;
      autoOpenPending = !alreadySeen();
      if (autoOpenPending) markSeen();
    }
    if (!autoOpenPending) return;
    setOpen(true);
    const timer = setTimeout(() => {
      autoOpenPending = false;
    }, 0);
    return () => clearTimeout(timer);
  }, [suggestions.length]);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);

    const html = document.documentElement;
    const scrollY = window.scrollY;
    const previousHtmlOverflow = html.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    const previousBodyPosition = document.body.style.position;
    const previousBodyTop = document.body.style.top;
    const previousBodyWidth = document.body.style.width;

    html.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      html.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousBodyOverflow;
      document.body.style.position = previousBodyPosition;
      document.body.style.top = previousBodyTop;
      document.body.style.width = previousBodyWidth;
      window.scrollTo(0, scrollY);
    };
  }, [open]);

  if (suggestions.length === 0) return null;

  const batch = suggestions.slice(offset, offset + SUGGESTION_BATCH_SIZE);
  const canAdvance = offset + SUGGESTION_BATCH_SIZE < suggestions.length;
  const from = offset + 1;
  const to = offset + batch.length;

  function show() {
    setOffset(0);
    setOpen(true);
  }

  return (
    <>
      <Button type="button" variant="secondary" onClick={show}>
        Pick up where you left off
      </Button>
      {open && mounted
        ? createPortal(
            <div className="fixed inset-0 z-50 h-dvh w-full">
              <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" aria-hidden="true" />
              <div
                className="relative flex h-full min-h-dvh items-center justify-center p-4"
                role="presentation"
                onMouseDown={(event) => {
                  if (event.target === event.currentTarget) setOpen(false);
                }}
              >
                <div
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="continue-suggestions-title"
                  className="flex max-h-[min(90dvh,calc(100dvh-2rem))] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl"
                >
                  <div className="flex items-start justify-between gap-3 border-b border-zinc-800 px-5 py-4">
                    <div>
                      <h2
                        id="continue-suggestions-title"
                        className="text-lg font-semibold text-zinc-100"
                      >
                        Continue reading
                      </h2>
                      <p className="mt-1 text-sm text-zinc-400">
                        In-progress titles you have not opened in a while, ranked
                        by how well they match your library. {from}–{to} of{" "}
                        {suggestions.length}.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setOpen(false)}
                      className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-100"
                      aria-label="Close"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>

                  <ul className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-5">
                    {batch.map((suggestion) => (
                      <li key={suggestion.bookId}>
                        <Link
                          href={`/read/${suggestion.bookId}`}
                          className="flex gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 transition hover:border-zinc-600"
                        >
                          <div className="relative h-24 w-16 shrink-0 overflow-hidden rounded-md bg-zinc-800">
                            <CoverImage
                              src={suggestion.coverUrl}
                              alt=""
                              sizes="64px"
                              className="object-cover"
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <h3 className="line-clamp-2 text-sm font-semibold text-zinc-50">
                                {suggestion.title}
                              </h3>
                              <span className="shrink-0 text-xs font-medium text-violet-300">
                                {suggestion.score}% match
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-zinc-400">{suggestion.progressText}</p>
                            {suggestion.progressPercent != null && (
                              <Progress
                                value={suggestion.progressPercent}
                                className="mt-2"
                              />
                            )}
                            <p className="mt-2 text-xs leading-5 text-zinc-500">
                              {suggestion.reason}
                            </p>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>

                  <div className="flex items-center justify-end gap-2 border-t border-zinc-800 px-5 py-4">
                    <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                      Close
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={!canAdvance}
                      onClick={() => setOffset((current) => current + SUGGESTION_BATCH_SIZE)}
                    >
                      Another set
                    </Button>
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
