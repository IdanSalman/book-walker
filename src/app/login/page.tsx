import Link from "next/link";
import { BookOpen } from "lucide-react";

import { SignInButtons } from "@/components/sign-in-buttons";
import { getConfiguredAuthProviders } from "@/lib/auth-providers";

function signInErrorMessage(error: string | undefined) {
  if (!error) return null;
  if (error === "Configuration") {
    return "Google sign-in could not be started. Check your connection and try again.";
  }
  if (error === "AccessDenied") {
    return "Sign-in was cancelled or denied.";
  }
  if (error === "OAuthCallback" || error === "OAuthSignin") {
    return "Google returned an error during sign-in. Try again.";
  }
  return "Sign-in failed. Try again.";
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const providers = getConfiguredAuthProviders();
  const { error } = await searchParams;
  const errorMessage = signInErrorMessage(error);

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
        {errorMessage ? (
          <p className="rounded-md border border-red-900/60 bg-red-950/40 px-3 py-3 text-sm text-red-200">
            {errorMessage}
          </p>
        ) : null}
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
