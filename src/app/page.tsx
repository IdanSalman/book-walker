import Link from "next/link";
import { BookOpen } from "lucide-react";

import { SignInButtons } from "@/components/sign-in-buttons";
import { getConfiguredAuthProviders } from "@/lib/auth-providers";

export default function LandingPage() {
  const providers = getConfiguredAuthProviders();

  return (
    <main className="flex flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center gap-10 px-4 py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-600/20 ring-1 ring-violet-500/40">
          <BookOpen className="h-8 w-8 text-violet-400" />
        </div>
        <div className="space-y-4">
          <h1 className="text-4xl font-bold tracking-tight text-zinc-50 sm:text-5xl">
            Book Walker
          </h1>
          <p className="mx-auto max-w-xl text-lg text-zinc-400">
            Track manga, manhwa, manhua, light novels, and books. Rate what you
            finish and always know which page you left off on.
          </p>
        </div>

        <div className="grid w-full max-w-md gap-6 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 text-left">
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">Get started</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Sign in with Google or GitHub to open your personal library.
            </p>
          </div>
          <SignInButtons providers={providers} />
          <Link
            href="/login"
            className="text-center text-sm text-zinc-400 hover:text-zinc-200"
          >
            Go to login page
          </Link>
        </div>

        <ul className="grid w-full max-w-3xl gap-4 text-left sm:grid-cols-3">
          {[
            {
              title: "Personal library",
              body: "Each account keeps its own progress, ratings, and status.",
            },
            {
              title: "Shared catalog",
              body: "Admins maintain the store of recognized titles with covers and summaries.",
            },
            {
              title: "Page progress",
              body: "Update your current page and see completion at a glance.",
            },
          ].map((item) => (
            <li
              key={item.title}
              className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4"
            >
              <h3 className="font-medium text-zinc-100">{item.title}</h3>
              <p className="mt-2 text-sm text-zinc-500">{item.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
