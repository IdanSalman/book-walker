"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import type { Book, UserBook } from "@prisma/client";
import { BookOpen, ChevronDown } from "lucide-react";

import { StarsInput } from "@/components/stars";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import {
  removeFromLibrary,
  updateUserBook,
  type ActionState,
} from "@/lib/actions/library";
import { isOngoingPublication, progressLabel } from "@/lib/publication";
import { isReadableComic } from "@/lib/reader/access";

const initialState: ActionState = {};

export function UserBookForm({
  book,
  userBook,
  libraryCategories,
  selectedCategoryIds = [],
}: {
  book: Book;
  userBook: UserBook;
  libraryCategories?: { id: string; name: string }[];
  selectedCategoryIds?: string[];
}) {
  const router = useRouter();
  const [rating, setRating] = useState<number | null>(userBook.rating);
  const [currentPage, setCurrentPage] = useState(userBook.currentPage);
  const boundUpdate = updateUserBook.bind(null, book.id);
  const [state, formAction, pending] = useActionState(boundUpdate, initialState);
  const [removing, setRemoving] = useState(false);

  const progress =
    book.totalPages > 0 ? (currentPage / book.totalPages) * 100 : 0;

  const progressSummary = `${progressLabel(currentPage, book)}${
    !isOngoingPublication(book.publicationStatus)
      ? ` (${Math.round(progress)}%)`
      : ""
  }`;

  return (
    <div className="space-y-4">
      <details className="group rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0">
            <span className="block text-sm font-medium text-zinc-200">
              Progress & library
            </span>
            <span className="mt-0.5 block truncate text-xs text-zinc-500">
              {progressSummary}
            </span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-zinc-400 transition group-open:rotate-180" />
        </summary>

        <div className="mt-5 space-y-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm text-zinc-400">
              <span>Progress</span>
              <span>{progressSummary}</span>
            </div>
            <Progress value={progress} className="h-3" />
          </div>

          <form action={formAction} className="space-y-5">
            <input type="hidden" name="rating" value={rating ?? ""} />

            <div className="space-y-2">
              <Label htmlFor="currentPage">
                {book.category === "MANGA" ? "Chapters read" : "Current page"}
              </Label>
              <Input
                id="currentPage"
                name="currentPage"
                type="number"
                min={0}
                max={book.totalPages}
                required
                value={currentPage}
                onChange={(e) => setCurrentPage(Number(e.target.value))}
              />
              <input
                type="range"
                min={0}
                max={book.totalPages}
                value={currentPage}
                onChange={(e) => setCurrentPage(Number(e.target.value))}
                className="w-full accent-violet-500"
              />
            </div>

            <div className="space-y-2">
              <Label>Rating</Label>
              <StarsInput value={rating} onChange={setRating} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select id="status" name="status" defaultValue={userBook.status}>
                <option value="PLAN_TO_READ">Plan to read</option>
                <option value="READING">Reading</option>
                <option value="COMPLETED">Completed</option>
              </Select>
            </div>

            {libraryCategories && (
              <fieldset className="space-y-2">
                <input type="hidden" name="syncCategories" value="1" />
                <legend className="text-sm font-medium leading-none text-zinc-300">
                  Collections
                </legend>
                {libraryCategories.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {libraryCategories.map((category) => (
                      <label
                        key={category.id}
                        className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 has-[:checked]:border-violet-500 has-[:checked]:bg-violet-950/40 has-[:checked]:text-violet-100"
                      >
                        <input
                          type="checkbox"
                          name="categoryIds"
                          value={category.id}
                          defaultChecked={selectedCategoryIds.includes(
                            category.id,
                          )}
                          className="accent-violet-500"
                        />
                        {category.name}
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-zinc-500">No collections yet.</p>
                )}
                <Link
                  href="/library"
                  className="inline-block text-xs text-violet-400 hover:text-violet-300"
                >
                  Manage collections
                </Link>
              </fieldset>
            )}

            {state.error && (
              <p className="rounded-md border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-300">
                {state.error}
              </p>
            )}
            {state.success && (
              <p className="rounded-md border border-emerald-900 bg-emerald-950/50 px-3 py-2 text-sm text-emerald-300">
                Progress saved.
              </p>
            )}

            <div className="flex flex-wrap gap-3">
              <Button
                type="submit"
                disabled={pending}
                variant={isReadableComic(book.category) ? "secondary" : "default"}
              >
                {pending ? "Saving…" : "Save progress"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={removing}
                onClick={async () => {
                  if (!confirm("Remove this book from your library?")) return;
                  setRemoving(true);
                  await removeFromLibrary(book.id);
                  router.refresh();
                  setRemoving(false);
                }}
              >
                {removing ? "Removing…" : "Remove from library"}
              </Button>
            </div>
          </form>
        </div>
      </details>
    </div>
  );
}
