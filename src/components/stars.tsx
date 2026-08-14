import { Star } from "lucide-react";

import { cn } from "@/lib/utils";

export function StarsDisplay({
  rating,
  className,
}: {
  rating: number | null | undefined;
  className?: string;
}) {
  if (rating == null) {
    return (
      <span className={cn("text-xs text-zinc-500", className)}>Not rated</span>
    );
  }

  return (
    <div className={cn("flex items-center gap-0.5", className)}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className={cn(
            "h-3.5 w-3.5",
            i < Math.round(rating)
              ? "fill-amber-400 text-amber-400"
              : "text-zinc-600",
          )}
        />
      ))}
    </div>
  );
}

export function StarsInput({
  value,
  onChange,
  disabled,
}: {
  value: number | null;
  onChange: (rating: number | null) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 5 }, (_, i) => {
        const starValue = i + 1;
        const active = value != null && starValue <= value;
        return (
          <button
            key={starValue}
            type="button"
            disabled={disabled}
            onClick={() => onChange(value === starValue ? null : starValue)}
            className="rounded p-0.5 transition hover:scale-110 disabled:opacity-50"
            aria-label={`Rate ${starValue} stars`}
          >
            <Star
              className={cn(
                "h-6 w-6",
                active ? "fill-amber-400 text-amber-400" : "text-zinc-600",
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
