"use client"

import Link from "next/link"
import {
  ChevronRightIcon,
  ExternalLinkIcon,
  FileTextIcon,
  SearchIcon,
} from "lucide-react"

import { Kbd } from "@/components/probe/kbd"
import { buttonVariants } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { ThemeToggle } from "@/components/shell/theme-toggle"
import { useBreadcrumbsStore } from "@/lib/stores/breadcrumbs"
import { isActiveRun, isReviewPause, runStatusLabel } from "@/lib/labels"
import { cn } from "@/lib/utils"

/**
 * The badge in the top-right while the user is on a run page. Tone +
 * pulse follow the run's status:
 *   - active (*_running)        -> accent + pulsing dot, label "Live"
 *   - review (*_review)         -> warn   + steady dot, label "Awaiting you"
 *   - completed                 -> ok     + steady dot, label "Completed"
 *   - failed                    -> err    + steady dot, label "Failed"
 *   - else (pending / unknown)  -> muted, label "Queued"
 */
function RunBadge({ status }: { status?: string }) {
  if (!status) return null
  const active = isActiveRun(status)
  const review = isReviewPause(status)
  const variant: "accent" | "warn" | "ok" | "err" | "muted" = active
    ? "accent"
    : review
      ? "warn"
      : status === "completed"
        ? "ok"
        : status === "failed"
          ? "err"
          : "muted"
  const label = active
    ? "Live"
    : review
      ? "Awaiting you"
      : runStatusLabel(status)
  return (
    /* aria-live so status transitions are announced to screen readers. */
    <div aria-live="polite" aria-atomic="true">
      {/* key={variant} causes React to replace the badge when the variant
       *  changes. probe-slide-in makes the new badge slide in from below,
       *  giving the status transition a spatial, confident feel. */}
      <Badge
        key={variant}
        variant={variant}
        className="gap-1.5 probe-slide-in transition-[background-color,color,border-color] duration-300"
      >
        <span
          aria-hidden
          className={cn(
            "size-1.5 rounded-full",
            variant === "accent" && "bg-accent-ink motion-safe:animate-pulse",
            variant === "warn" && "bg-warn-ink",
            variant === "ok" && "bg-ok-ink",
            variant === "err" && "bg-err-ink",
            variant === "muted" && "bg-ink-3",
          )}
        />
        {label}
      </Badge>
    </div>
  )
}

export function Topbar() {
  const items = useBreadcrumbsStore((s) => s.items)
  const rightSlot = useBreadcrumbsStore((s) => s.rightSlot)
  const runSlot = useBreadcrumbsStore((s) => s.runSlot)

  return (
    <div
      data-slot="topbar"
      className="border-border bg-background flex h-[52px] shrink-0 items-center gap-3 border-b px-4"
    >
      {/* SidebarTrigger is an icon-only button — add accessible label */}
      <SidebarTrigger
        aria-label="Toggle sidebar"
        className="text-ink-3 hover:text-foreground -ml-1 transition-colors"
      />

      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-sm">
        {items.map((c, i) => {
          const isLast = i === items.length - 1
          const content = (
            <span
              className={cn(
                /* Parent crumbs: muted; current page: foreground + medium weight */
                isLast
                  ? "text-foreground font-medium"
                  : "text-ink-3",
                c.muted && "text-ink-3",
                c.mono &&
                  "font-mono text-xs bg-muted rounded-sm px-1.5 py-0.5",
              )}
            >
              {c.label}
            </span>
          )
          return (
            <span key={c.href ?? c.label ?? i} className="flex items-center gap-2">
              {i > 0 && <ChevronRightIcon aria-hidden className="text-ink-3 size-[13px] shrink-0" />}
              {c.href && !isLast ? (
                <Link href={c.href} className="hover:text-foreground transition-colors duration-150">
                  {content}
                </Link>
              ) : (
                content
              )}
            </span>
          )
        })}
      </nav>

      <div className="ml-auto flex items-center gap-2">
        {/* key={rightSlot} causes a remount + probe-fade-in when the slot
         *  switches between 'default' (search button) and 'run' (run badge
         *  + action links). This makes route changes feel intentional rather
         *  than abrupt. */}
        <div key={rightSlot} className="probe-fade-in flex items-center gap-2">
          {rightSlot === "run" && (
            <>
              <RunBadge status={runSlot.runStatus} />
              {runSlot.exportReportHref && (
                <Link
                  href={runSlot.exportReportHref}
                  className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
                >
                  <FileTextIcon aria-hidden className="size-[13px]" />
                  Export report
                </Link>
              )}
              {runSlot.openTestHref && (
                <Link
                  href={runSlot.openTestHref}
                  className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
                >
                  <ExternalLinkIcon aria-hidden className="size-[13px]" />
                  Open feature test
                </Link>
              )}
            </>
          )}
          {rightSlot === "default" && (
            <button
              type="button"
              onClick={() => {
                window.dispatchEvent(
                  new KeyboardEvent("keydown", { key: "k", metaKey: true }),
                )
              }}
              className="border-border bg-card hover:bg-muted hover:border-ink-4/50 text-ink-3 hover:text-foreground inline-flex h-8 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Open command palette"
            >
              <SearchIcon aria-hidden className="size-[13px]" />
              <span>Search</span>
              <Kbd>⌘K</Kbd>
            </button>
          )}
        </div>
        <ThemeToggle />
      </div>
    </div>
  )
}
