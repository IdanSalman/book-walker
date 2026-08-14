import { redirect } from "next/navigation";

import { requireUser } from "@/lib/session";

export default async function ReaderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireUser();

  if (!session.user.onboardingComplete) {
    redirect("/onboarding");
  }

  return <div className="min-h-dvh bg-black">{children}</div>;
}
