import Link from "next/link";
import { BookOpen } from "lucide-react";

import { SignInButtons } from "@/components/sign-in-buttons";
import { getConfiguredAuthProviders } from "@/lib/auth-providers";

export default function LoginPage() {
  const providers = getConfiguredAuthProviders();

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-8">
        <div className="space-y-2 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-violet-600/20">
            <BookOpen className="h-6 w-6 text-violet-400" />
          </div>
          <h1 className="text-2xl font-bold text-zinc-50">Sign in</h1>
          <p className="text-sm text-zinc-500">
            Access your personal Book Walker library.
          </p>
        </div>
        <SignInButtons providers={providers} />
        <p className="text-center text-sm text-zinc-500">
          <Link href="/" className="text-violet-400 hover:text-violet-300">
            Back to home
          </Link>
        </p>
      </div>
    </main>
  );
}
