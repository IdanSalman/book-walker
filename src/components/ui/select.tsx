import * as React from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <div className="relative min-w-0">
    <select
      ref={ref}
      className={cn(
        "flex h-10 w-full cursor-pointer appearance-none rounded-lg border border-zinc-700/80 bg-zinc-900/90 py-2 pl-3 pr-9 text-sm text-zinc-100 shadow-sm transition",
        "hover:border-zinc-600 hover:bg-zinc-900",
        "focus-visible:border-violet-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/30",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
    </select>
    <ChevronDown
      className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"
      aria-hidden
    />
  </div>
));
Select.displayName = "Select";

export function SelectField({
  label,
  className,
  selectClassName,
  children,
  ...selectProps
}: {
  label?: string;
  className?: string;
  selectClassName?: string;
  children: React.ReactNode;
} & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <label className={cn("flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2", className)}>
      {label && (
        <span className="shrink-0 text-sm font-medium text-zinc-400">{label}</span>
      )}
      <Select className={cn("min-w-[10rem]", selectClassName)} {...selectProps}>
        {children}
      </Select>
    </label>
  );
}
