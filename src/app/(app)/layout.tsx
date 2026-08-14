import { redirect } from "next/navigation";

import { AppNav } from "@/components/nav";
import { requireUser } from "@/lib/session";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireUser();

  if (!session.user.onboardingComplete) {
    redirect("/onboarding");
  }

  return (
    <>
      <AppNav session={session} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        {children}
      </main>
    </>
  );
}
