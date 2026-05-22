import { cn } from "@/lib/utils"

export function PanelFrame({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      {children}
    </div>
  )
}

export function PanelHead({
  num,
  numClassName,
  title,
  desc,
  right,
  icon,
}: {
  num?: string
  numClassName?: string
  title: string
  desc?: React.ReactNode
  right?: React.ReactNode
  icon?: React.ReactNode
}) {
  return (
    <div className="border-border flex items-center gap-3 border-b px-6 py-3.5">
      {num && (
        <div
          className={cn(
            "bg-foreground text-background grid size-[34px] place-items-center rounded-md font-mono text-[13px] font-semibold",
            numClassName
          )}
        >
          {num}
        </div>
      )}
      {icon}
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-medium">{title}</div>
        {desc && (
          <div className="text-ink-3 mt-0.5 text-[12px]">{desc}</div>
        )}
      </div>
      {right && <div className="flex items-center gap-2">{right}</div>}
    </div>
  )
}

export function PanelBody({
  children,
  noPad,
  className,
}: {
  children: React.ReactNode
  noPad?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        "min-h-0 flex-1 overflow-auto",
        noPad ? "p-0" : "px-6 py-5",
        className
      )}
    >
      {children}
    </div>
  )
}
