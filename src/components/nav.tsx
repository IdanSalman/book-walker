import Link from "next/link";
import { BookOpen, LayoutDashboard, Library, Shield, Store } from "lucide-react";

import { SignOutButton } from "@/components/sign-out-button";
import type { Session } from "next-auth";

export function AppNav({ session }: { session: Session }) {
  const isAdmin = session.user.role === "ADMIN";
  const displayName = session.user.name ?? session.user.email ?? "Account";

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-6">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 font-semibold text-zinc-50"
          >
            <BookOpen className="h-5 w-5 text-violet-400" />
            Book Walker
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            <NavLink href="/dashboard" icon={<LayoutDashboard className="h-4 w-4" />}>
              Dashboard
            </NavLink>
            <NavLink href="/library" icon={<Library className="h-4 w-4" />}>
              Library
            </NavLink>
            <NavLink href="/library/add" icon={<Store className="h-4 w-4" />}>
              Browse store
            </NavLink>
            {isAdmin && (
              <NavLink href="/admin/books" icon={<Shield className="h-4 w-4" />}>
                Admin
              </NavLink>
            )}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/account"
            className="text-right transition hover:opacity-80"
          >
            <p className="max-w-[140px] truncate text-sm font-medium text-zinc-100 sm:max-w-none">
              {displayName}
            </p>
            <p className="text-xs text-zinc-500">
              {isAdmin ? "Admin" : "Reader"}
            </p>
          </Link>
          <SignOutButton />
        </div>
      </div>
      <nav className="flex gap-1 overflow-x-auto border-t border-zinc-900 px-4 py-2 md:hidden">
        <NavLink href="/dashboard" icon={<LayoutDashboard className="h-4 w-4" />}>
          Home
        </NavLink>
        <NavLink href="/library" icon={<Library className="h-4 w-4" />}>
          Library
        </NavLink>
        <NavLink href="/library/add" icon={<Store className="h-4 w-4" />}>
          Store
        </NavLink>
        {isAdmin && (
          <NavLink href="/admin/books" icon={<Shield className="h-4 w-4" />}>
            Admin
          </NavLink>
        )}
      </nav>
    </header>
  );
}

function NavLink({
  href,
  children,
  icon,
}: {
  href: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-50"
    >
      {icon}
      {children}
    </Link>
  );
}
