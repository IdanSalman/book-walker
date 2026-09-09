"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { addToLibrary } from "@/lib/actions/library";

export function AddToLibraryButton({
  bookId,
  inLibrary,
  onAdded,
}: {
  bookId: string;
  inLibrary: boolean;
  onAdded?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [added, setAdded] = useState(false);

  if (inLibrary || added) {
    return (
      <Button variant="secondary" disabled>
        In your library
      </Button>
    );
  }

  return (
    <Button
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          const result = await addToLibrary(bookId);
          if (result.error) return;
          setAdded(true);
          onAdded?.();
          router.refresh();
        });
      }}
    >
      {pending ? "Adding…" : "Add to library"}
    </Button>
  );
}
