import type { ReactNode } from "react";

/** A table's title with the actions that act on it. */
export function TableToolbar({
  title,
  children,
}: Readonly<{ title: string; children?: ReactNode }>) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-sm font-semibold">{title}</h2>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}
