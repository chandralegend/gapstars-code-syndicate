"use client"

import { useState } from "react"
import { CodeIcon, CopyIcon, TerminalIcon, XIcon } from "lucide-react"

import { StatusDot } from "@/components/probe/status-dot"
import { Tag } from "@/components/probe/tag"
import { ScriptCode } from "@/components/screens/scripts/script-code"
import { ScriptLogs } from "@/components/screens/scripts/script-logs"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { Script } from "@/lib/types"

export function ScriptDrawer({
  script,
  running,
  onClose,
}: {
  script: Script
  running: boolean
  onClose: () => void
}) {
  const [tab, setTab] = useState<"code" | "logs">("code")

  return (
    <aside
      role="dialog"
      className="border-border bg-card fixed inset-y-0 right-0 z-40 flex w-[640px] flex-col border-l shadow-xl"
    >
      <header className="border-border flex items-center gap-2.5 border-b px-4 py-3">
        <CodeIcon className="size-[14px]" />
        <span className="font-medium">{script.name}</span>
        <Tag>{script.lang}</Tag>
        {running && (
          <Badge variant="accent" className="gap-1.5">
            <StatusDot kind="running" size={6} />
            running
          </Badge>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm">
            <CopyIcon className="size-[13px]" />
            Copy
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setTab(tab === "code" ? "logs" : "code")}
          >
            {tab === "code" ? (
              <>
                <TerminalIcon className="size-[13px]" />
                Logs
              </>
            ) : (
              <>
                <CodeIcon className="size-[13px]" />
                Code
              </>
            )}
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
            <XIcon className="size-[13px]" />
          </Button>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === "code" ? <ScriptCode /> : <ScriptLogs running={running} />}
      </div>
    </aside>
  )
}
