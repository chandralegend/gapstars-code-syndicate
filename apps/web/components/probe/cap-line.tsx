import { cn } from "@/lib/utils"

export function CapLine({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "text-ink-4 font-mono text-[10.5px] font-semibold tracking-[0.1em] uppercase",
        className
      )}
    >
      {children}
    </div>
  )
}
