import { cn } from "@/lib/utils"

export function PageHead({
  title,
  sub,
  actions,
  className,
}: {
  title: React.ReactNode
  sub?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "border-border flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b px-6 pt-6 pb-5",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <h1 className="font-serif text-[clamp(24px,4vw,34px)] leading-[1.1] tracking-[-0.015em]">
          {title}
        </h1>
        {sub && <div className="text-ink-3 mt-1 text-[13px]">{sub}</div>}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      )}
    </div>
  )
}
