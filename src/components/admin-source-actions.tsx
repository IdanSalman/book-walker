"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { AnimatedSwitch } from "@/components/animated-switch";
import { Button } from "@/components/ui/button";
import {
  addBuiltInSource,
  addMissingBuiltInSources,
  deleteSource,
  resyncSourceBooks,
  setSourceEnabled,
  testAllSources,
  testSourceConnection,
  type SourceActionState,
} from "@/lib/actions/sources";

function useSourceAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<SourceActionState>) {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) setError(result.error);
      if (result.message) setMessage(result.message);
      router.refresh();
    });
  }

  return { pending, message, error, run };
}

function Feedback({
  message,
  error,
}: {
  message: string | null;
  error: string | null;
}) {
  if (!message && !error) return null;
  return (
    <>
      {message && <p className="text-sm text-emerald-400">{message}</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}
    </>
  );
}

export function AdminSourceEnabledToggle({
  sourceId,
  enabled,
  compact,
}: {
  sourceId: string;
  enabled: boolean;
  compact?: boolean;
}) {
  const { pending, run } = useSourceAction();

  return (
    <div className="flex items-center gap-2">
      <AnimatedSwitch
        size={compact ? "sm" : "md"}
        checked={enabled}
        disabled={pending}
        onCheckedChange={(checked) => run(() => setSourceEnabled(sourceId, checked))}
        aria-label={enabled ? "Disable source" : "Enable source"}
      />
      <span className="text-xs text-zinc-400">
        {pending ? "…" : enabled ? "Enabled" : "Disabled"}
      </span>
    </div>
  );
}

export function AdminSourceTestButton({
  sourceId,
  size = "default",
}: {
  sourceId: string;
  size?: "default" | "sm";
}) {
  const { pending, message, error, run } = useSourceAction();

  return (
    <div className="space-y-1.5">
      <Button
        type="button"
        variant="outline"
        size={size}
        disabled={pending}
        onClick={() => run(() => testSourceConnection(sourceId))}
      >
        {pending ? "Testing…" : "Test connection"}
      </Button>
      <Feedback message={message} error={error} />
    </div>
  );
}

export function AdminTestAllSourcesButton() {
  const { pending, message, error, run } = useSourceAction();

  return (
    <div className="space-y-1.5">
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        onClick={() => run(() => testAllSources())}
      >
        {pending ? "Testing all sources…" : "Test all connections"}
      </Button>
      <Feedback message={message} error={error} />
    </div>
  );
}

export function AdminSourceResyncButton({
  sourceId,
  disabled,
}: {
  sourceId: string;
  disabled?: boolean;
}) {
  const { pending, message, error, run } = useSourceAction();

  return (
    <div className="space-y-1.5">
      <Button
        type="button"
        variant="outline"
        disabled={pending || disabled}
        onClick={() => run(() => resyncSourceBooks(sourceId))}
      >
        {pending ? "Refetching…" : "Refetch chapter counts"}
      </Button>
      <p className="text-xs text-zinc-500">
        Refreshes up to 25 unfinished titles from this source, oldest sync first.
      </p>
      <Feedback message={message} error={error} />
    </div>
  );
}

export function AdminAddBuiltInSourceButton({
  sourceKey,
  label,
}: {
  sourceKey: string;
  label: string;
}) {
  const { pending, error, run } = useSourceAction();

  return (
    <div className="space-y-1">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={pending}
        onClick={() => run(() => addBuiltInSource(sourceKey))}
      >
        {pending ? "Adding…" : label}
      </Button>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}

export function AdminAddAllBuiltInSourcesButton() {
  const { pending, message, error, run } = useSourceAction();

  return (
    <div className="space-y-1.5">
      <Button
        type="button"
        disabled={pending}
        onClick={() => run(() => addMissingBuiltInSources())}
      >
        {pending ? "Adding…" : "Add built-in sources"}
      </Button>
      <Feedback message={message} error={error} />
    </div>
  );
}

export function AdminSourceDeleteButton({ sourceId }: { sourceId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="destructive"
      disabled={pending}
      onClick={() => {
        if (
          !confirm(
            "Remove this source? Catalog entries keep their source name, but the site is no longer managed here.",
          )
        ) {
          return;
        }
        startTransition(async () => {
          await deleteSource(sourceId);
        });
      }}
    >
      {pending ? "Removing…" : "Remove source"}
    </Button>
  );
}
