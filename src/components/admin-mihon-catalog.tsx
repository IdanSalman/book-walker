"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select";
import { addMihonSources, type SourceActionState } from "@/lib/actions/sources";
import {
  languageLabel,
  mihonCatalogHref,
  type MihonCatalogSource,
  type MihonCatalogStatus,
} from "@/lib/sources/mihon-catalog";

export type MihonBrowseRow = MihonCatalogSource & { added: boolean };

export function AdminMihonBrowseFilters({
  query,
  lang,
  hideAdult,
  status,
  languages,
}: {
  query: string;
  lang: string;
  hideAdult: boolean;
  status: MihonCatalogStatus;
  languages: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function push(next: {
    q?: string;
    lang?: string;
    hideAdult?: boolean;
    status?: MihonCatalogStatus;
  }) {
    startTransition(() => {
      router.push(
        mihonCatalogHref({
          q: (next.q ?? query) || undefined,
          lang: next.lang ?? lang,
          hideAdult: next.hideAdult ?? hideAdult,
          status: next.status ?? status,
        }),
      );
    });
  }

  return (
    <form
      className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/30 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        const q =
          new FormData(event.currentTarget).get("q")?.toString().trim() ?? "";
        push({ q: q || undefined, lang, hideAdult, status });
      }}
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[16rem] flex-1">
          <Input
            name="q"
            defaultValue={query}
            placeholder="Search by name, site, or package…"
            disabled={pending}
          />
        </div>
        <Button type="submit" variant="secondary" disabled={pending}>
          Search
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <SelectField
          label="Language"
          value={lang}
          disabled={pending}
          onChange={(event) =>
            push({
              q: query || undefined,
              lang: event.target.value,
              hideAdult,
              status,
            })
          }
          selectClassName="min-w-[12rem]"
        >
          <option value="*">Any language</option>
          {languages.map((code) => (
            <option key={code} value={code}>
              {languageLabel(code)}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Show"
          value={status}
          disabled={pending}
          onChange={(event) =>
            push({
              q: query || undefined,
              lang,
              hideAdult,
              status: event.target.value as MihonCatalogStatus,
            })
          }
          selectClassName="min-w-[10rem]"
        >
          <option value="available">Not added yet</option>
          <option value="added">Already added</option>
          <option value="all">All sources</option>
        </SelectField>
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={hideAdult}
            disabled={pending}
            onChange={(event) =>
              push({
                q: query || undefined,
                lang,
                hideAdult: event.target.checked,
                status,
              })
            }
            className="h-4 w-4 rounded border-zinc-600 bg-zinc-900 text-violet-600"
          />
          Hide adult sources
        </label>
      </div>
    </form>
  );
}

export function AdminMihonSourcePicker({ sources }: { sources: MihonBrowseRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const availableIds = useMemo(
    () => sources.filter((source) => !source.added).map((source) => source.id),
    [sources],
  );
  const selectedAvailable = selected.filter((id) => availableIds.includes(id));
  const allSelected =
    availableIds.length > 0 &&
    availableIds.every((id) => selected.includes(id));

  function run(ids: string[]) {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const result: SourceActionState = await addMihonSources(ids);
      if (result.error) setError(result.error);
      if (result.message) {
        setMessage(result.message);
        setSelected((current) => current.filter((id) => !ids.includes(id)));
      }
      router.refresh();
    });
  }

  function toggle(id: string, checked: boolean) {
    setSelected((current) =>
      checked ? [...new Set([...current, id])] : current.filter((item) => item !== id),
    );
  }

  if (sources.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-zinc-800 px-6 py-10 text-center text-sm text-zinc-400">
        No Mihon sources match these filters.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-zinc-400">
          <input
            type="checkbox"
            checked={allSelected}
            disabled={pending || availableIds.length === 0}
            onChange={(event) =>
              setSelected(event.target.checked ? availableIds : [])
            }
            className="h-4 w-4 rounded border-zinc-600 bg-zinc-900 text-violet-600"
          />
          Select page
        </label>
        <div className="flex flex-wrap items-center gap-3">
          {selectedAvailable.length > 0 && (
            <Button
              type="button"
              size="sm"
              disabled={pending}
              onClick={() => run(selectedAvailable)}
            >
              {pending
                ? "Adding…"
                : `Add ${selectedAvailable.length} selected`}
            </Button>
          )}
        </div>
      </div>

      {message && <p className="text-sm text-emerald-400">{message}</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}

      <ul className="divide-y divide-zinc-800 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/30">
        {sources.map((source) => {
          const checked = selected.includes(source.id);
          return (
            <li
              key={source.id}
              className="flex flex-wrap items-center gap-3 px-4 py-3"
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={pending || source.added}
                onChange={(event) => toggle(source.id, event.target.checked)}
                aria-label={`Select ${source.name}`}
                className="h-4 w-4 rounded border-zinc-600 bg-zinc-900 text-violet-600"
              />
              {source.iconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={source.iconUrl}
                  alt=""
                  width={32}
                  height={32}
                  className="h-8 w-8 rounded-md bg-zinc-800 object-cover"
                />
              ) : (
                <div className="h-8 w-8 rounded-md bg-zinc-800" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate font-medium text-zinc-100">
                    {source.name}
                  </p>
                  {source.hasImporter && (
                    <Badge className="border-violet-900/50 bg-violet-950/50 text-violet-300">
                      Importer
                    </Badge>
                  )}
                  {source.isAdult && (
                    <Badge className="border-red-900/50 bg-red-950/50 text-red-300">
                      Adult
                    </Badge>
                  )}
                  <Badge>{languageLabel(source.language)}</Badge>
                  {source.languages.length > 1 && (
                    <Badge className="border-zinc-800 bg-zinc-900 text-zinc-400">
                      {source.languages.length} langs
                    </Badge>
                  )}
                </div>
                <a
                  href={source.baseUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-0.5 inline-flex items-center gap-1 truncate text-xs text-violet-400 hover:text-violet-300"
                >
                  {source.baseUrl.replace(/^https?:\/\//, "")}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              {source.added ? (
                <span className="text-xs font-medium text-zinc-500">Added</span>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={pending}
                  onClick={() => run([source.id])}
                >
                  {pending ? "Adding…" : "Add"}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
