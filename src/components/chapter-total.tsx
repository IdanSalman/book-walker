"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { pagesFieldLabel, pagesMetadataLabel } from "@/lib/publication";
import type { Book } from "@prisma/client";

type ChapterTotalContextValue = {
  totalPages: number;
  publish: (totalPages: number) => void;
};

const ChapterTotalContext = createContext<ChapterTotalContextValue | null>(null);

export function ChapterTotalProvider({
  totalPages,
  children,
}: {
  totalPages: number;
  children: ReactNode;
}) {
  const [total, setTotal] = useState(totalPages);
  if (totalPages > total) setTotal(totalPages);

  const publish = useCallback((next: number) => {
    setTotal((current) => (next > current ? next : current));
  }, []);

  return (
    <ChapterTotalContext.Provider value={{ totalPages: total, publish }}>
      {children}
    </ChapterTotalContext.Provider>
  );
}

export function useChapterTotal(): number {
  return useContext(ChapterTotalContext)?.totalPages ?? 0;
}

/** Raise the entry's chapter total after the chapter list resolves. */
export function PublishChapterTotal({ totalPages }: { totalPages: number }) {
  const publish = useContext(ChapterTotalContext)?.publish;

  useEffect(() => {
    publish?.(totalPages);
  }, [publish, totalPages]);

  return null;
}

export function LiveChapterCount({
  book,
}: {
  book: Pick<Book, "category" | "totalPages" | "publicationStatus">;
}) {
  const totalPages = Math.max(book.totalPages, useChapterTotal());

  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {pagesFieldLabel(book.category)}
      </dt>
      <dd className="mt-1 text-sm text-zinc-200">
        {pagesMetadataLabel({ ...book, totalPages })}
      </dd>
    </div>
  );
}
