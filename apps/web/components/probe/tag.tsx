import { cn } from "@/lib/utils"

export function Tag({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        "border-border bg-muted text-ink-3 inline-flex items-center rounded-[3px] border px-1.5 py-px font-mono text-[10.5px] leading-none",
        className
      )}
    >
      {children}
    </span>
  )
}
