"use client";

import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { deleteBook } from "@/lib/actions/admin";

export function DeleteBookButton({ bookId }: { bookId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="destructive"
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm("Delete this book from the store? This cannot be undone.")) {
          return;
        }
        startTransition(async () => {
          await deleteBook(bookId);
        });
      }}
    >
      {pending ? "Deleting…" : "Delete book"}
    </Button>
  );
}
