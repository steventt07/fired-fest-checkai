import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * A clean, technical panel surface used across the workbench.
 * Replaces the previous macOS-style window chrome with a purpose-built
 * tool aesthetic: flat header, monospace-friendly title, optional meta slot.
 */
export function Panel({
  title,
  icon,
  meta,
  children,
  className,
  bodyClassName,
}: {
  title: ReactNode;
  icon?: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm",
        className,
      )}
    >
      <div className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-border bg-muted/40 px-4">
        <div className="flex min-w-0 items-center gap-2">
          {icon && <span className="text-muted-foreground">{icon}</span>}
          <span className="truncate font-mono text-[13px] font-medium text-foreground">
            {title}
          </span>
        </div>
        {meta && (
          <div className="shrink-0 text-xs text-muted-foreground">{meta}</div>
        )}
      </div>
      <div className={cn("min-h-0 flex-1", bodyClassName)}>{children}</div>
    </div>
  );
}
