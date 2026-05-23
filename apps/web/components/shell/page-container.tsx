import { cn } from "@/lib/utils"

/**
 * Single source of truth for page width. Wrap every route's body in
 * <PageContainer> so the eye lands in the same place on every page.
 *
 *   - `default`  : 1280px max, the Vercel-ish dashboard width.
 *   - `wide`     : 1440px, for tables that genuinely need the room.
 *   - `narrow`   : 880px, for forms and reading-shaped content.
 */
export function PageContainer({
  children,
  size = "default",
  className,
}: {
  children: React.ReactNode
  size?: "default" | "wide" | "narrow"
  className?: string
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full px-6",
        size === "narrow" && "max-w-[880px]",
        size === "default" && "max-w-[1280px]",
        size === "wide" && "max-w-[1440px]",
        className,
      )}
    >
      {children}
    </div>
  )
}
