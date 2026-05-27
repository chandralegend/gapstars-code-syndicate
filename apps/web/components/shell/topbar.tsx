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
    <Badge variant={variant} className="gap-1.5">
      <span
        className={cn(
          "size-1.5 rounded-full",
          variant === "accent" && "bg-accent-ink animate-pulse",
          variant === "warn" && "bg-warn-ink",
          variant === "ok" && "bg-ok-ink",
          variant === "err" && "bg-err-ink",
          variant === "muted" && "bg-ink-4",
        )}
      />
      {label}
    </Badge>
  )
}

export function Topbar() {
  const items = useBreadcrumbsStore((s) => s.items)
  const rightSlot = useBreadcrumbsStore((s) => s.rightSlot)
  const runSlot = useBreadcrumbsStore((s) => s.runSlot)

  return (
    <div className="border-border bg-background flex h-[52px] shrink-0 items-center gap-3 border-b px-4">
      <SidebarTrigger className="text-ink-3 hover:text-foreground -ml-1" />

      <div className="flex min-w-0 items-center gap-2 text-[13px]">
        {items.map((c, i) => {
          const content = (
            <span
              className={cn(
                c.muted && "text-ink-3",
                c.mono &&
                  "text-foreground bg-muted rounded-[3px] px-1.5 py-0.5 font-mono text-[12px]",
              )}
            >
              {c.label}
            </span>
          )
          return (
            <span key={i} className="flex items-center gap-2">
              {i > 0 && <ChevronRightIcon className="text-ink-4 size-[13px]" />}
              {c.href ? (
                <Link href={c.href} className="hover:text-foreground">
                  {content}
                </Link>
              ) : (
                content
              )}
            </span>
          )
        })}
      </div>

      <div className="ml-auto flex items-center gap-2.5">
        {rightSlot === "run" && (
          <>
            <RunBadge status={runSlot.runStatus} />
            {runSlot.exportReportHref && (
              <Link
                href={runSlot.exportReportHref}
                className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
              >
                <FileTextIcon className="size-[13px]" />
                Export report
              </Link>
            )}
            {runSlot.openTestHref && (
              <Link
                href={runSlot.openTestHref}
                className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
              >
                <ExternalLinkIcon className="size-[13px]" />
                Open feature test
              </Link>
            )}
          </>
        )}
        {rightSlot === "default" && (
          <button
            type="button"
            onClick={() => {
              // Synthesise the ⌘K keystroke. The CommandPalette listens for
              // it as the canonical open trigger so we route through one
              // path.
              window.dispatchEvent(
                new KeyboardEvent("keydown", { key: "k", metaKey: true }),
              )
            }}
            className="border-border bg-card hover:bg-muted text-ink-2 hover:text-foreground inline-flex h-8 items-center gap-2 rounded-md border px-2.5 text-[12.5px]"
            aria-label="Open command palette"
          >
            <SearchIcon className="size-[13px]" />
            <span>Search</span>
            <Kbd>⌘K</Kbd>
          </button>
        )}
        <ThemeToggle />
      </div>
    </div>
  )
}
