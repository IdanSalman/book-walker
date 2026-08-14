"use client";

import { cn } from "@/lib/utils";

type AnimatedSwitchProps = {
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
  id?: string;
  size?: "sm" | "md";
  "aria-label"?: string;
};

export function AnimatedSwitch({
  checked,
  disabled,
  onCheckedChange,
  id,
  size = "md",
  "aria-label": ariaLabel,
}: AnimatedSwitchProps) {
  const compact = size === "sm";

  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex shrink-0 items-center rounded-full transition-colors duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 disabled:cursor-not-allowed disabled:opacity-50",
        compact ? "h-5 w-9" : "h-7 w-12",
        checked ? "bg-violet-600" : "bg-zinc-700",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "pointer-events-none inline-block rounded-full bg-white shadow-md transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]",
          compact ? "size-3.5" : "size-5",
          compact
            ? checked
              ? "translate-x-[18px]"
              : "translate-x-0.5"
            : checked
              ? "translate-x-6"
              : "translate-x-1",
        )}
      />
    </button>
  );
}
