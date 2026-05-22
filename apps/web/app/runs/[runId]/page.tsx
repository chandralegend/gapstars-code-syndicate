"use client"

import { use } from "react"

import { RightPanel } from "@/components/screens/run/right-panel"
import { Timeline } from "@/components/screens/run/timeline"
import { AGENT_NODES } from "@/lib/mock/agent-nodes"
import { useSetBreadcrumbs } from "@/lib/stores/breadcrumbs"
import { useRunView } from "@/lib/stores/run-view"
import type { RunNode } from "@/lib/types"

export default function RunPage({
  params,
}: {
  params: Promise<{ runId: string }>
}) {
  const { runId } = use(params)
  const selectedNode = useRunView((s) => s.selectedNode)
  const gate1Approved = useRunView((s) => s.gate1Approved)

  useSetBreadcrumbs(
    [
      { label: "acme/shop", muted: true },
      { label: "Tests", href: "/tests" },
      { label: "Saved Carts", muted: true, href: "/tests" },
      { label: runId, mono: true },
    ],
    "run"
  )

  const nodes: RunNode[] = AGENT_NODES.map((n) => {
    if (n.id === "hitl1") {
      return { ...n, status: gate1Approved ? "done" : "wait" } satisfies RunNode
    }
    return n
  })
  const node = nodes.find((n) => n.id === selectedNode) ?? nodes[0]

  return (
    <div className="grid h-full grid-cols-[400px_minmax(0,1fr)] overflow-hidden">
      <aside className="border-border min-w-0 overflow-auto border-r">
        <Timeline nodes={nodes} runId={runId} />
      </aside>
      <section className="min-w-0 overflow-hidden">
        <RightPanel node={node} />
      </section>
    </div>
  )
}
