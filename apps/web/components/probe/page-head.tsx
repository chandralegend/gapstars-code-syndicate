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
        "border-border flex items-end justify-between border-b px-6 pt-6 pb-5",
        className
      )}
    >
      <div>
        <h1
          className="font-serif text-[34px] leading-[1.1] tracking-[-0.015em]"
          style={{ fontFamily: "var(--font-serif), serif" }}
        >
          {title}
        </h1>
        {sub && <div className="text-ink-3 mt-1 text-[13px]">{sub}</div>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
