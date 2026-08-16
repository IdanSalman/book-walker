import Image from "next/image";
import Link from "next/link";

import { AdultContentSetting } from "@/components/adult-content-setting";
import { HideReadTitlesSetting } from "@/components/hide-read-titles-setting";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

function formatDate(date: Date) {
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default async function AccountPage() {
  const session = await requireUser();

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: {
      accounts: {
        select: { provider: true },
      },
      _count: { select: { userBooks: true } },
    },
  });

  if (!user) {
    return null;
  }

  const hideAdultContent = session.user.hideAdultContent ?? true;
  const hideReadTitles = session.user.hideReadTitles ?? false;
  const librarySize = hideAdultContent
    ? await prisma.userBook.count({
        where: { userId: user.id, book: { isAdult: false } },
      })
    : user._count.userBooks;
  const providers = [...new Set(user.accounts.map((a) => a.provider))];

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-zinc-50">Account</h1>
        <p className="mt-1 text-zinc-400">Your profile and preferences.</p>
      </div>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
        <div className="flex items-start gap-4">
          <div className="relative size-16 shrink-0 overflow-hidden rounded-full bg-zinc-800">
            {user.image ? (
              <Image
                src={user.image}
                alt=""
                fill
                className="object-cover"
                unoptimized
              />
            ) : (
              <div className="flex size-full items-center justify-center text-xl font-semibold text-zinc-500">
                {(user.name ?? user.email ?? "?").charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div className="min-w-0 space-y-1">
            <h2 className="truncate text-xl font-semibold text-zinc-50">
              {user.name ?? "Reader"}
            </h2>
            <p className="truncate text-sm text-zinc-400">{user.email}</p>
            <Badge className="mt-2">{user.role === "ADMIN" ? "Admin" : "Reader"}</Badge>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          Preferences
        </h2>
        <AdultContentSetting hideAdultContent={hideAdultContent} />
        <HideReadTitlesSetting hideReadTitles={hideReadTitles} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          Details
        </h2>
        <dl className="divide-y divide-zinc-800 rounded-xl border border-zinc-800 bg-zinc-900/50">
          <DetailRow label="Email" value={user.email ?? "—"} />
          <DetailRow label="Display name" value={user.name ?? "—"} />
          <DetailRow
            label="Sign-in providers"
            value={providers.length ? providers.join(", ") : "—"}
          />
          <DetailRow label="Member since" value={formatDate(user.createdAt)} />
          <DetailRow
            label="Library size"
            value={`${librarySize} title${librarySize === 1 ? "" : "s"}`}
          />
        </dl>
      </section>

      <Link
        href="/dashboard"
        className="inline-block rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-200 transition hover:border-zinc-500"
      >
        View library
      </Link>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3">
      <dt className="text-sm text-zinc-500">{label}</dt>
      <dd className="text-sm font-medium text-zinc-100">{value}</dd>
    </div>
  );
}
