"use client"

import Link from "next/link"
import { ChevronRightIcon, HistoryIcon, PauseIcon, SearchIcon, SquareIcon } from "lucide-react"

import { Kbd } from "@/components/probe/kbd"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { ThemeToggle } from "@/components/shell/theme-toggle"
import { useBreadcrumbsStore } from "@/lib/stores/breadcrumbs"
import { cn } from "@/lib/utils"

export function Topbar() {
  const items = useBreadcrumbsStore((s) => s.items)
  const rightSlot = useBreadcrumbsStore((s) => s.rightSlot)

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
                  "text-foreground bg-muted rounded-[3px] px-1.5 py-0.5 font-mono text-[12px]"
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
            <Badge variant="accent" className="gap-1.5">
              <span className="bg-accent-ink size-1.5 rounded-full" />
              live · SSE
            </Badge>
            <Button variant="ghost" size="sm">
              <HistoryIcon className="size-[13px]" />
              History
            </Button>
            <Button variant="ghost" size="sm">
              <PauseIcon className="size-[13px]" />
              Pause run
            </Button>
            <Button variant="ghost" size="sm">
              <SquareIcon className="size-[13px]" />
              Stop
            </Button>
            <Kbd>⌘.</Kbd>
          </>
        )}
        {rightSlot === "default" && (
          <>
            <Button variant="ghost" size="sm">
              <SearchIcon className="size-[13px]" />
              Search
            </Button>
            <Kbd>⌘K</Kbd>
          </>
        )}
        <ThemeToggle />
      </div>
    </div>
  )
}
