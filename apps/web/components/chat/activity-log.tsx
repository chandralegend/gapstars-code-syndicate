"use client"

import { useState } from "react"
import {
  ArrowRightLeft,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  Cog,
} from "lucide-react"

import { AgentBadge } from "@/components/chat/agent-badge"
import { cn } from "@/lib/utils"
import { type ActivityEvent, type AgentName, AGENT_DISPLAY } from "@/lib/types"

interface ActivityLogProps {
  events: ActivityEvent[]
  className?: string
}

export function ActivityLog({ events, className }: ActivityLogProps) {
  if (events.length === 0) return null

  // Group consecutive tool_call + tool_result pairs
  const items = buildActivityItems(events)

  return (
    <div className={cn("flex flex-col gap-0.5 pl-11", className)}>
      {items.map((item, i) => (
        <ActivityItem key={i} item={item} />
      ))}
    </div>
  )
}

// ── Activity item types ─────────────────────────────────────────────────────

type ActivityItemData =
  | { kind: "agent_switch"; agent: AgentName; from: AgentName | null }
  | { kind: "tool"; tool: string; toolLabel: string; args: Record<string, unknown>; result?: string; agent: AgentName }

function buildActivityItems(events: ActivityEvent[]): ActivityItemData[] {
  const items: ActivityItemData[] = []
  const pendingTools = new Map<string, ActivityItemData & { kind: "tool" }>()

  for (const event of events) {
    if (event.type === "agent_switch") {
      items.push({ kind: "agent_switch", agent: event.agent, from: event.from })
    } else if (event.type === "tool_call") {
      const toolItem: ActivityItemData & { kind: "tool" } = {
        kind: "tool",
        tool: event.tool,
        toolLabel: event.toolLabel,
        args: event.args,
        agent: event.agent,
      }
      pendingTools.set(event.tool, toolItem)
      items.push(toolItem)
    } else if (event.type === "tool_result") {
      const pending = pendingTools.get(event.tool)
      if (pending) {
        pending.result = event.result
        pendingTools.delete(event.tool)
      } else {
        // Orphan result — show standalone
        items.push({
          kind: "tool",
          tool: event.tool,
          toolLabel: event.toolLabel,
          args: {},
          result: event.result,
          agent: event.agent,
        })
      }
    }
  }

  return items
}

// ── Individual activity item renderer ───────────────────────────────────────

function ActivityItem({ item }: { item: ActivityItemData }) {
  if (item.kind === "agent_switch") {
    return <AgentSwitchItem agent={item.agent} from={item.from} />
  }
  return <ToolItem item={item} />
}

function AgentSwitchItem({ agent, from }: { agent: AgentName; from: AgentName | null }) {
  return (
    <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground">
      <ArrowRightLeft className="size-3 shrink-0" />
      {from ? (
        <span className="flex items-center gap-1.5">
          <AgentBadge agent={from} className="opacity-50" />
          <span>→</span>
          <AgentBadge agent={agent} />
        </span>
      ) : (
        <span className="flex items-center gap-1.5">
          <AgentBadge agent={agent} />
          <span>is handling your request</span>
        </span>
      )}
    </div>
  )
}

function ToolItem({ item }: { item: ActivityItemData & { kind: "tool" } }) {
  const [expanded, setExpanded] = useState(false)
  const hasResult = item.result !== undefined
  const agentDisplay = AGENT_DISPLAY[item.agent]

  return (
    <div className="group">
      {/* Tool call header — clickable to expand */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "flex w-full items-center gap-2 rounded-md py-1 text-left text-xs text-muted-foreground",
          "transition-colors hover:text-foreground"
        )}
      >
        {hasResult ? (
          <CircleCheck className="size-3 shrink-0 text-emerald-500" />
        ) : (
          <Cog className="size-3 shrink-0 animate-spin" />
        )}
        <span className="font-medium text-foreground/80">{item.toolLabel}</span>
        {Object.keys(item.args).length > 0 && (
          <span className="truncate opacity-60">
            ({Object.entries(item.args).map(([k, v]) => `${k}: ${v}`).join(", ")})
          </span>
        )}
        <span className="ml-auto">
          {expanded ? (
            <ChevronDown className="size-3" />
          ) : (
            <ChevronRight className="size-3" />
          )}
        </span>
      </button>

      {/* Expanded detail panel */}
      {expanded && (
        <div className={cn(
          "mb-1 ml-5 overflow-hidden rounded-md border text-xs",
          agentDisplay.bgMuted
        )}>
          {/* Args */}
          {Object.keys(item.args).length > 0 && (
            <div className="border-b px-3 py-2">
              <div className="mb-1 font-medium text-muted-foreground">Arguments</div>
              <pre className="whitespace-pre-wrap break-all font-mono text-[11px] text-foreground/70">
                {JSON.stringify(item.args, null, 2)}
              </pre>
            </div>
          )}
          {/* Result */}
          {hasResult && (
            <div className="px-3 py-2">
              <div className="mb-1 font-medium text-muted-foreground">Result</div>
              <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap break-all font-mono text-[11px] text-foreground/70">
                {formatResult(item.result!)}
              </pre>
            </div>
          )}
          {/* Loading state */}
          {!hasResult && (
            <div className="flex items-center gap-2 px-3 py-2 text-muted-foreground">
              <Cog className="size-3 animate-spin" />
              <span>Running...</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Try to pretty-print JSON results, fall back to raw text */
function formatResult(result: string): string {
  try {
    const parsed = JSON.parse(result)
    return JSON.stringify(parsed, null, 2)
  } catch {
    return result
  }
}
