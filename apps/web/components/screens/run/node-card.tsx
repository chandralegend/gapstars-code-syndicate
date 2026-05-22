"use client"

import { ClockIcon, CpuIcon, DollarSignIcon, EyeIcon, CheckIcon } from "lucide-react"

import { StatusDot } from "@/components/probe/status-dot"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import type { AgentNode, GateNode } from "@/lib/types"
import { cn } from "@/lib/utils"

export function NodeCard({
  node,
  selected,
  onClick,
}: {
  node: AgentNode
  selected: boolean
  onClick: () => void
}) {
  const statusBadge = () => {
    if (node.status === "running")
      return (
        <Badge variant="accent" className="gap-1.5">
          <StatusDot kind="running" size={6} />
          running
        </Badge>
      )
    if (node.status === "done") return <Badge variant="ok">done</Badge>
    if (node.status === "idle") return <Badge variant="muted">queued</Badge>
    return null
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative w-full text-left",
        "pl-7"
      )}
    >
      {/* marker dot on the timeline rail */}
      <span
        className={cn(
          "border-border bg-card absolute top-3.5 left-[7px] z-10 size-[10px] rounded-full border-2",
          node.status === "done" && "bg-ok border-ok",
          node.status === "running" && "bg-accent border-accent",
          node.status === "err" && "bg-err border-err"
        )}
      />
      <div
        className={cn(
          "border-border bg-card hover:border-ink-4/50 rounded-lg border p-3 transition-colors",
          selected && "border-foreground ring-foreground/10 ring-2"
        )}
      >
        <div className="mb-1 flex items-center gap-2">
          <span className="bg-muted text-ink-3 rounded-[3px] px-1.5 py-px font-mono text-[10.5px]">
            Agent {node.agent}
          </span>
          {statusBadge()}
        </div>
        <div className="text-[13.5px] font-medium">{node.name}</div>
        <div className="text-ink-3 mt-0.5 text-[12px]">{node.desc}</div>
        {(node.elapsed || node.tokens || node.cost) && (
          <div className="text-ink-4 mt-2 flex items-center gap-3 font-mono text-[11px]">
            {node.elapsed && (
              <span className="flex items-center gap-1">
                <ClockIcon className="size-[11px]" />
                {node.elapsed}
              </span>
            )}
            {node.tokens && (
              <span className="flex items-center gap-1">
                <CpuIcon className="size-[11px]" />
                {node.tokens} tok
              </span>
            )}
            {node.cost && (
              <span className="flex items-center gap-1">
                <DollarSignIcon className="size-[11px]" />
                {node.cost}
              </span>
            )}
          </div>
        )}
        {node.status === "running" && (
          <Progress
            value={(node.progress ?? 0.4) * 100}
            className="mt-2 h-1"
          />
        )}
      </div>
    </button>
  )
}

export function GateCard({
  node,
  selected,
  onClick,
}: {
  node: GateNode
  selected: boolean
  onClick: () => void
}) {
  const done = node.status === "done"
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("relative w-full text-left", "pl-7")}
    >
      <span
        className={cn(
          "absolute top-3 left-[5px] z-10 grid size-[14px] place-items-center rounded-[3px] border-2",
          done
            ? "bg-ok border-ok text-white"
            : "border-warn bg-warn-soft text-warn-ink"
        )}
        aria-hidden
      >
        {done ? <CheckIcon className="size-[8px]" /> : <EyeIcon className="size-[8px]" />}
      </span>
      <div
        className={cn(
          "border-border bg-card flex items-center gap-2.5 rounded-lg border p-3",
          done && "border-ok/30 bg-ok-soft/30",
          !done && "border-warn/40 bg-warn-soft/40",
          selected && "ring-foreground/15 ring-2"
        )}
      >
        {done ? (
          <CheckIcon className="text-ok-ink size-[14px]" />
        ) : (
          <EyeIcon className="text-warn-ink size-[14px]" />
        )}
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium">{node.name}</div>
          <div className="text-ink-3 text-[11px]">
            {done
              ? `Accepted by ${node.approver} · ${node.when}`
              : "Awaiting human review"}
          </div>
        </div>
        <span className="bg-muted text-ink-3 rounded-[3px] px-1.5 py-px font-mono text-[10px]">
          interrupt
        </span>
      </div>
    </button>
  )
}
