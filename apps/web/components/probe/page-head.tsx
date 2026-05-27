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
        "border-border flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b pt-6 pb-6",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        {/* Instrument Serif for display headings — the editorial serif
         *  against Geist UI text creates the product's signature type
         *  contrast moment. italic for a touch of personality. */}
        <h1 className="font-serif text-[32px] leading-[1.1] font-normal tracking-[-0.01em] italic">
          {title}
        </h1>
        {sub && <div className="text-ink-3 mt-1 text-sm">{sub}</div>}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      )}
    </div>
  )
}
