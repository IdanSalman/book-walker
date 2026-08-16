import Link from "next/link";

import { cn } from "@/lib/utils";

export function FilterChip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-full px-3 py-1.5 text-sm",
        active
          ? "bg-violet-600 font-medium text-white"
          : "border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200",
      )}
    >
      {children}
    </Link>
  );
}
