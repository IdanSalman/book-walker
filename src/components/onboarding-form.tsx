"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  completeOnboarding,
  type OnboardingState,
} from "@/lib/actions/onboarding";

const initialState: OnboardingState = {};

export function OnboardingForm() {
  const router = useRouter();
  const { update } = useSession();
  const [state, formAction, pending] = useActionState(
    async (prev: OnboardingState, formData: FormData) => {
      const result = await completeOnboarding(prev, formData);
      if (!result.error) {
        await update();
        router.push("/dashboard");
        router.refresh();
      }
      return result;
    },
    initialState,
  );

  return (
    <form action={formAction} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="name">Display name</Label>
        <Input
          id="name"
          name="name"
          required
          autoComplete="username"
          autoFocus
          placeholder="Pick a unique name"
          minLength={2}
          maxLength={32}
        />
        <p className="text-xs text-zinc-500">
          This is how you appear across Book Walker. Names must be unique.
        </p>
      </div>

      {state.error && (
        <p className="rounded-md border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-300">
          {state.error}
        </p>
      )}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Saving…" : "Continue"}
      </Button>
    </form>
  );
}
