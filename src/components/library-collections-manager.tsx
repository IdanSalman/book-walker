"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createLibraryCategory,
  deleteLibraryCategory,
  renameLibraryCategory,
} from "@/lib/actions/library";
import { libraryPageHref } from "@/lib/library-query";

type Collection = {
  id: string;
  name: string;
  slug: string;
  count: number;
};

type LibraryCollectionsManagerProps = {
  categories: Collection[];
  currentSlug?: string;
  hrefParams: {
    collection?: string;
    category?: string;
    status?: string;
    publication?: string;
    sort?: string;
  };
};

export function LibraryCollectionsManager({
  categories,
  currentSlug,
  hrefParams,
}: LibraryCollectionsManagerProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);

  function create() {
    const name = newName.trim();
    if (!name) return;
    setError(null);
    startTransition(async () => {
      const result = await createLibraryCategory(name);
      if (result.error) {
        setError(result.error);
        return;
      }
      setNewName("");
      router.refresh();
    });
  }

  return (
    <details className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4">
      <summary className="cursor-pointer text-sm font-medium text-zinc-200">
        Manage collections
      </summary>
      <div className="mt-4 space-y-4">
        <p className="text-xs text-zinc-500">
          Rename or delete a collection. Titles that are not in any other
          collection move to Uncategorized.
        </p>

        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            create();
          }}
        >
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New collection name"
            maxLength={50}
            disabled={pending}
            className="h-8 max-w-xs"
            aria-label="New collection name"
          />
          <Button
            type="submit"
            size="sm"
            disabled={pending || !newName.trim()}
          >
            <Plus className="h-3.5 w-3.5" />
            Create
          </Button>
        </form>

        {error && (
          <p className="rounded-md border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}

        {categories.length === 0 ? (
          <p className="text-sm text-zinc-500">No collections yet.</p>
        ) : (
          <ul className="space-y-2">
            {categories.map((category) => (
              <CollectionRow
                key={category.id}
                category={category}
                currentSlug={currentSlug}
                hrefParams={hrefParams}
                disabled={pending}
                onError={setError}
              />
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}

function CollectionRow({
  category,
  currentSlug,
  hrefParams,
  disabled,
  onError,
}: {
  category: Collection;
  currentSlug?: string;
  hrefParams: LibraryCollectionsManagerProps["hrefParams"];
  disabled: boolean;
  onError: (message: string | null) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(category.name);
  const dirty = name.trim() !== category.name;
  const busy = disabled || pending;

  useEffect(() => {
    setName(category.name);
  }, [category.name]);

  function save() {
    const next = name.trim();
    if (!next || next === category.name) return;
    onError(null);
    startTransition(async () => {
      const result = await renameLibraryCategory(category.id, next);
      if (result.error) {
        onError(result.error);
        return;
      }
      if (currentSlug === category.slug && result.slug) {
        router.replace(
          libraryPageHref({ ...hrefParams, collection: result.slug }),
        );
        return;
      }
      router.refresh();
    });
  }

  function remove() {
    if (
      !confirm(
        `Delete “${category.name}”? Titles in only this collection will move to Uncategorized.`,
      )
    ) {
      return;
    }
    onError(null);
    startTransition(async () => {
      const result = await deleteLibraryCategory(category.id);
      if (result.error) {
        onError(result.error);
        return;
      }
      if (currentSlug === category.slug) {
        router.replace(
          libraryPageHref({ ...hrefParams, collection: undefined }),
        );
        return;
      }
      router.refresh();
    });
  }

  return (
    <li className="flex flex-wrap items-center gap-2">
      <form
        className="flex min-w-0 flex-1 flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={50}
          disabled={busy}
          className="h-8 min-w-[10rem] flex-1"
          aria-label={`Rename ${category.name}`}
        />
        <Button
          type="submit"
          size="sm"
          variant="secondary"
          disabled={busy || !dirty || !name.trim()}
        >
          Save
        </Button>
      </form>
      <span className="text-xs text-zinc-500">
        {category.count.toLocaleString()} title
        {category.count === 1 ? "" : "s"}
      </span>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={busy}
        onClick={remove}
        aria-label={`Delete ${category.name}`}
      >
        <Trash2 className="h-3.5 w-3.5" />
        Delete
      </Button>
    </li>
  );
}
