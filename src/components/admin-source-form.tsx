"use client";

import { useActionState, useState } from "react";
import type { FetchSource, SourceKind } from "@prisma/client";

import { AnimatedSwitch } from "@/components/animated-switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  createSource,
  updateSource,
  type SourceActionState,
} from "@/lib/actions/sources";
import { SOURCE_KIND_LABELS } from "@/lib/sources/registry";

const KINDS = Object.keys(SOURCE_KIND_LABELS) as SourceKind[];

const initialState: SourceActionState = {};

export function AdminSourceForm({
  source,
  defaultName,
}: {
  source?: FetchSource;
  defaultName?: string;
}) {
  const action = source ? updateSource.bind(null, source.id) : createSource;
  const [state, formAction, pending] = useActionState(action, initialState);

  const [enabled, setEnabled] = useState(source?.enabled ?? true);
  const [supportsSearch, setSupportsSearch] = useState(
    source?.supportsSearch ?? false,
  );
  const [supportsMetadata, setSupportsMetadata] = useState(
    source?.supportsMetadata ?? false,
  );
  const [supportsReading, setSupportsReading] = useState(
    source?.supportsReading ?? false,
  );
  const [isAdultSource, setIsAdultSource] = useState(
    source?.isAdultSource ?? false,
  );

  return (
    <form action={formAction} className="space-y-6">
      <section className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          Website
        </h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="name">Display name</Label>
            <Input
              id="name"
              name="name"
              required
              defaultValue={source?.name ?? defaultName ?? ""}
              placeholder="Asura Scans"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="key">Key</Label>
            <Input
              id="key"
              name="key"
              defaultValue={source?.key ?? ""}
              placeholder="asurascans"
              pattern="[a-z0-9-]+"
            />
            <p className="text-xs text-zinc-500">
              Lowercase identifier used to match catalog entries. Left blank, it is
              derived from the name.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="baseUrl">Website URL</Label>
          <Input
            id="baseUrl"
            name="baseUrl"
            type="url"
            required
            defaultValue={source?.baseUrl ?? ""}
            placeholder="https://asuracomic.net"
          />
          <p className="text-xs text-zinc-500">
            Used by the connection test and the “Open site” link.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="kind">Access type</Label>
            <Select
              id="kind"
              name="kind"
              defaultValue={source?.kind ?? "SCRAPER"}
            >
              {KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {SOURCE_KIND_LABELS[kind]}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="language">Language</Label>
            <Input
              id="language"
              name="language"
              required
              defaultValue={source?.language ?? "en"}
              placeholder="en"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="priority">Priority</Label>
            <Input
              id="priority"
              name="priority"
              type="number"
              min={0}
              max={1000}
              defaultValue={source?.priority ?? 0}
            />
            <p className="text-xs text-zinc-500">Higher sorts first.</p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea
            id="notes"
            name="notes"
            rows={3}
            defaultValue={source?.notes ?? ""}
            placeholder="What this site is used for, quirks, rate limits…"
          />
        </div>
      </section>

      <section className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          Capabilities
        </h2>

        <SwitchRow
          name="enabled"
          label="Enabled"
          description={
            enabled
              ? "Available for fetching and imports."
              : "Paused — imports and refetches are blocked."
          }
          checked={enabled}
          onChange={setEnabled}
        />
        <SwitchRow
          name="supportsSearch"
          label="Catalog search"
          description={
            supportsSearch
              ? "Search this website for titles to import into the store."
              : "Turn this on to search the site and import titles."
          }
          checked={supportsSearch}
          onChange={setSupportsSearch}
        />
        <SwitchRow
          name="supportsMetadata"
          label="Metadata refetch"
          description="Chapter counts and publication status can be refreshed from here."
          checked={supportsMetadata}
          onChange={setSupportsMetadata}
        />
        <SwitchRow
          name="supportsReading"
          label="In-app reading"
          description={
            supportsReading
              ? "Library titles assigned to this site can be read in Book Walker."
              : "Turn this on so library titles can be read from this site."
          }
          checked={supportsReading}
          onChange={setSupportsReading}
        />
        <SwitchRow
          name="isAdultSource"
          label="Adult site"
          description="Titles imported from here are flagged as adult by default."
          checked={isAdultSource}
          onChange={setIsAdultSource}
        />
      </section>

      {state.error && (
        <p className="rounded-md border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-300">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="rounded-md border border-emerald-900 bg-emerald-950/50 px-3 py-2 text-sm text-emerald-300">
          {state.message ?? "Source saved"}
        </p>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : source ? "Save changes" : "Add source"}
      </Button>
    </form>
  );
}

function SwitchRow({
  name,
  label,
  description,
  checked,
  onChange,
}: {
  name: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3">
      <div className="space-y-1">
        <Label htmlFor={`${name}-switch`}>{label}</Label>
        <p className="text-xs text-zinc-500">{description}</p>
      </div>
      <AnimatedSwitch
        id={`${name}-switch`}
        checked={checked}
        onCheckedChange={onChange}
      />
      <input type="hidden" name={name} value={checked ? "true" : "false"} />
    </div>
  );
}
