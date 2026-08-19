"use client";

import { useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Select } from "@/components/ui/select";
import { updateDefaultReadingMode } from "@/lib/actions/preferences";
import {
  READING_MODE_PREFERENCES,
  parseReadingModePreference,
  readingModePreferenceLabel,
  type ReadingModePreference,
} from "@/lib/reader/types";

export function DefaultReadingModeSetting({
  defaultReadingMode,
}: {
  defaultReadingMode: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [optimisticMode, setOptimisticMode] = useOptimistic(
    parseReadingModePreference(defaultReadingMode),
    (_current, next: ReadingModePreference) => next,
  );

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h2 className="font-medium text-zinc-100">Default reading format</h2>
          <p className="text-sm text-zinc-400">
            {optimisticMode === "auto"
              ? "New titles follow the usual layout: right to left for manga, webtoon for Korean and Chinese series. You can still change format while reading."
              : `New titles open in ${readingModePreferenceLabel(optimisticMode).toLowerCase()}. A format you already picked for a title is kept.`}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-stretch gap-1.5 sm:w-48">
          <Select
            aria-label="Default reading format"
            value={optimisticMode}
            disabled={pending}
            onChange={(event) => {
              const next = parseReadingModePreference(event.target.value);
              startTransition(async () => {
                setOptimisticMode(next);
                await updateDefaultReadingMode(next);
                router.refresh();
              });
            }}
          >
            {READING_MODE_PREFERENCES.map((mode) => (
              <option key={mode} value={mode}>
                {readingModePreferenceLabel(mode)}
              </option>
            ))}
          </Select>
          <span className="text-xs text-zinc-500 sm:text-right">
            {pending ? "Saving…" : readingModePreferenceLabel(optimisticMode)}
          </span>
        </div>
      </div>
    </div>
  );
}
