import { cn } from "@/lib/utils"

export function Kbd({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <kbd
      className={cn(
        "border-border bg-muted text-muted-foreground inline-flex items-center rounded-sm border px-1.5 py-px font-mono text-[10.5px] leading-none",
        className
      )}
    >
      {children}
    </kbd>
  )
}
