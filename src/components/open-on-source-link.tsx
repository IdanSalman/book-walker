import { ExternalLink } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function OpenOnSourceLink({
  href,
  sourceName,
  size = "sm",
}: {
  href: string;
  sourceName?: string | null;
  size?: "sm" | "default";
}) {
  const label = sourceName?.trim()
    ? `Open on ${sourceName.trim()}`
    : "Open on source site";

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(buttonVariants({ variant: "outline", size }))}
    >
      <ExternalLink className="h-4 w-4" />
      {label}
    </a>
  );
}
