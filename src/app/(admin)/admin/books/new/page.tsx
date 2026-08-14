import Link from "next/link";

import { AdminBookForm } from "@/components/admin-book-form";

export default function NewBookPage() {
  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/books"
          className="text-sm text-zinc-500 hover:text-zinc-300"
        >
          ← Back to catalog
        </Link>
        <h1 className="mt-2 text-3xl font-bold text-zinc-50">Add book</h1>
        <p className="mt-1 text-zinc-400">
          Create a new title in the shared store.
        </p>
      </div>
      <AdminBookForm />
    </div>
  );
}
