"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Gauge, Globe, Library } from "lucide-react";

import { cn } from "@/lib/utils";

const TABS = [
  { href: "/admin", label: "Overview", icon: Gauge, exact: true },
  { href: "/admin/books", label: "Catalog", icon: Library, exact: false },
  { href: "/admin/sources", label: "Sources", icon: Globe, exact: false },
];

export function AdminTabs() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Admin sections"
      className="flex gap-1.5 overflow-x-auto rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-1.5"
    >
      {TABS.map((tab) => {
        const active = tab.exact
          ? pathname === tab.href
          : pathname.startsWith(tab.href);
        const Icon = tab.icon;

        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition",
              active
                ? "bg-violet-600 text-white"
                : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100",
            )}
          >
            <Icon className="h-4 w-4" />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
