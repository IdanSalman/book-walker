"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

import { coverSrc } from "@/lib/cover-url";
import { cn } from "@/lib/utils";

export function CoverImage({
  src,
  alt,
  sizes,
  priority,
  className,
  size,
  referer,
}: {
  src: string | null | undefined;
  alt: string;
  sizes: string;
  priority?: boolean;
  className?: string;
  size?: 256 | 512;
  referer?: string;
}) {
  const [failed, setFailed] = useState(false);
  const resolved = src?.trim() ?? "";
  const thumb = size ?? (priority ? 512 : 256);

  useEffect(() => {
    setFailed(false);
  }, [resolved]);

  if (!resolved || failed) {
    return (
      <div
        className="flex h-full w-full items-center justify-center bg-zinc-800 text-[10px] font-medium uppercase tracking-wide text-zinc-500"
        aria-hidden={!alt}
      >
        No cover
      </div>
    );
  }

  return (
    <Image
      src={coverSrc(resolved, thumb, referer)}
      alt={alt}
      fill
      className={cn("object-cover", className)}
      sizes={sizes}
      unoptimized
      priority={priority}
      loading={priority ? undefined : "lazy"}
      fetchPriority={priority ? "high" : "low"}
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}
