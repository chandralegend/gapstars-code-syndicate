import { cn } from "@/lib/utils"

export function StatCard({
  label,
  value,
  unit,
  delta,
  deltaKind,
  className,
}: {
  label: string
  value: string
  unit?: string
  delta?: string
  deltaKind?: "up" | "down"
  className?: string
}) {
  return (
    <div
      className={cn(
        "border-border bg-card rounded-lg border p-5",
        className
      )}
    >
      <div className="text-ink-3 text-[11.5px] font-medium tracking-wide uppercase">
        {label}
      </div>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span className="text-[26px] leading-none font-semibold tracking-[-0.02em]">
          {value}
        </span>
        {unit && <span className="text-ink-4 font-mono text-[12px]">{unit}</span>}
      </div>
      {delta && (
        <div
          className={cn(
            "mt-2 text-[11.5px] font-mono",
            deltaKind === "up" && "text-ok-ink",
            deltaKind === "down" && "text-err-ink",
            !deltaKind && "text-ink-4"
          )}
        >
          {delta}
        </div>
      )}
    </div>
  )
}
