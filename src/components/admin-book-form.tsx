"use client";

import { useActionState, useState } from "react";
import type { Book, PublicationStatus } from "@prisma/client";

import { AnimatedSwitch } from "@/components/animated-switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  createBook,
  updateBook,
  type ActionState,
} from "@/lib/actions/admin";
import { CATEGORIES } from "@/lib/categories";
import {
  PUBLICATION_STATUS_LABELS,
  pageCountLabel,
} from "@/lib/publication";
import { cn } from "@/lib/utils";

const PUBLICATION_STATUSES = Object.keys(
  PUBLICATION_STATUS_LABELS,
) as PublicationStatus[];

const initialState: ActionState = {};

export function AdminBookForm({
  book,
  embedded = false,
}: {
  book?: Book;
  embedded?: boolean;
}) {
  const action = book ? updateBook.bind(null, book.id) : createBook;

  const [state, formAction, pending] = useActionState(action, initialState);
  const [isAdult, setIsAdult] = useState(book?.isAdult ?? false);
  const [coverCorrupted, setCoverCorrupted] = useState(
    book?.coverCorrupted ?? false,
  );

  return (
    <form
      action={formAction}
      className={cn("space-y-6", !embedded && "mx-auto max-w-2xl")}
    >
      <section className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          Core details
        </h2>

        <div className="space-y-2">
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            name="title"
            required
            defaultValue={book?.title}
            placeholder="Book title"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="artist">Artist</Label>
            <Input
              id="artist"
              name="artist"
              defaultValue={book?.artist ?? ""}
              placeholder="Illustrator / artist"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="author">Author</Label>
            <Input
              id="author"
              name="author"
              defaultValue={book?.author ?? ""}
              placeholder="Writer / author"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="category">Type</Label>
            <Select
              id="category"
              name="category"
              required
              defaultValue={book?.category ?? "MANGA"}
            >
              {CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="totalPages">Total pages / chapters</Label>
            <Input
              id="totalPages"
              name="totalPages"
              type="number"
              min={1}
              required
              defaultValue={book?.totalPages ?? 1}
            />
            {book && (
              <p className="text-xs text-zinc-500">
                Store display:{" "}
                {pageCountLabel(book.totalPages, book.publicationStatus)}
              </p>
            )}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="publicationStatus">Publication status</Label>
            <Select
              id="publicationStatus"
              name="publicationStatus"
              defaultValue={book?.publicationStatus ?? "UNKNOWN"}
            >
              {PUBLICATION_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {PUBLICATION_STATUS_LABELS[status]}
                </option>
              ))}
            </Select>
            <p className="text-xs text-zinc-500">
              Ongoing titles show chapter count as e.g. 100/? in the store.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="genres">Categories (genres)</Label>
          <Input
            id="genres"
            name="genres"
            defaultValue={book?.genres.join(", ") ?? ""}
            placeholder="Action, Drama, Fantasy — comma-separated"
          />
          <p className="text-xs text-zinc-500">
            Genre tags shown in the catalog metadata.
          </p>
        </div>
      </section>

      <section className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          Content &amp; source
        </h2>

        <div className="space-y-2">
          <Label htmlFor="summary">Summary</Label>
          <Textarea
            id="summary"
            name="summary"
            required
            defaultValue={book?.summary}
            placeholder="Short description of the book"
            rows={5}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="coverUrl">Cover image URL</Label>
          <Input
            id="coverUrl"
            name="coverUrl"
            type="url"
            required
            defaultValue={book?.coverUrl}
            placeholder="https://example.com/cover.jpg"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="sourceName">Source name</Label>
          <Input
            id="sourceName"
            name="sourceName"
            defaultValue={book?.sourceName ?? ""}
            placeholder="MangaDex, AniList, Toonily, etc."
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="sourceUrl">Source URL (for refetch)</Label>
          <Input
            id="sourceUrl"
            name="sourceUrl"
            type="url"
            defaultValue={book?.sourceUrl ?? ""}
            placeholder="https://mangadex.org/title/… or https://anilist.co/manga/…"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="externalId">External ID</Label>
          <Input
            id="externalId"
            name="externalId"
            defaultValue={book?.externalId ?? ""}
            placeholder="anilist:15125"
          />
          <p className="text-xs text-zinc-500">
            Used to refetch metadata. AniList IDs use the format anilist:123.
          </p>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3">
          <div className="space-y-1">
            <Label htmlFor="isAdult-switch">Adult content</Label>
            <p className="text-xs text-zinc-500">
              {isAdult
                ? "This title is marked as adult."
                : "This title is not marked as adult."}
            </p>
          </div>
          <AnimatedSwitch
            id="isAdult-switch"
            checked={isAdult}
            onCheckedChange={setIsAdult}
          />
          <input type="hidden" name="isAdult" value={isAdult ? "true" : "false"} />
        </div>

        {book && (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3">
          <div className="space-y-1">
            <Label htmlFor="coverCorrupted-switch">Hide from store</Label>
            <p className="text-xs text-zinc-500">
              {coverCorrupted
                ? "Cover marked broken — hidden from marketplace."
                : "Cover shown in marketplace."}
            </p>
          </div>
          <AnimatedSwitch
            id="coverCorrupted-switch"
            checked={coverCorrupted}
            onCheckedChange={setCoverCorrupted}
          />
          <input
            type="hidden"
            name="coverCorrupted"
            value={coverCorrupted ? "true" : "false"}
          />
        </div>
        )}
      </section>

      {state.error && (
        <p className="rounded-md border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-300">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="rounded-md border border-emerald-900 bg-emerald-950/50 px-3 py-2 text-sm text-emerald-300">
          Book saved successfully.
        </p>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : book ? "Save changes" : "Add to store"}
      </Button>
    </form>
  );
}
