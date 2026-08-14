"use client";

import { signIn } from "next-auth/react";

import { Button } from "@/components/ui/button";

export function SignInButtons({
  providers,
}: {
  providers: { google: boolean; github: boolean };
}) {
  const hasAny = providers.google || providers.github;

  if (!hasAny) {
    return (
      <div className="rounded-md border border-amber-900/60 bg-amber-950/40 px-3 py-3 text-sm text-amber-200">
        OAuth is not configured. Add{" "}
        <code className="text-amber-100">AUTH_GITHUB_ID</code> and{" "}
        <code className="text-amber-100">AUTH_GITHUB_SECRET</code> (and/or Google
        credentials) to <code className="text-amber-100">.env</code>, then
        restart the dev server.
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-3">
      {providers.google && (
        <Button
          className="w-full"
          onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
        >
          Continue with Google
        </Button>
      )}
      {providers.github && (
        <Button
          variant={providers.google ? "secondary" : "default"}
          className="w-full"
          onClick={() => signIn("github", { callbackUrl: "/dashboard" })}
        >
          Continue with GitHub
        </Button>
      )}
    </div>
  );
}
