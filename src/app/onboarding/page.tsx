import { redirect } from "next/navigation";

import { OnboardingForm } from "@/components/onboarding-form";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { onboardingComplete: true },
  });

  if (user?.onboardingComplete) {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold text-zinc-50">Welcome to Book Walker</h1>
          <p className="text-sm text-zinc-400">
            Choose a display name to finish setting up your account.
          </p>
        </div>
        <OnboardingForm />
      </div>
    </div>
  );
}
