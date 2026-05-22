"use client"

import { CapLine } from "@/components/probe/cap-line"
import { GateCard, NodeCard } from "@/components/screens/run/node-card"
import { RunMeta } from "@/components/screens/run/run-meta"
import { useRunView } from "@/lib/stores/run-view"
import type { RunNode } from "@/lib/types"

export function Timeline({ nodes, runId }: { nodes: RunNode[]; runId: string }) {
  const selectedNode = useRunView((s) => s.selectedNode)
  const setSelectedNode = useRunView((s) => s.setSelectedNode)

  return (
    <div className="px-5 py-5">
      <RunMeta runId={runId} />
      <CapLine className="mb-2.5">orchestration graph</CapLine>

      {/* Timeline with vertical rail */}
      <div className="relative space-y-2.5">
        <div className="bg-border absolute top-3 bottom-3 left-[11px] w-px" />
        {nodes.map((n) =>
          n.kind === "gate" ? (
            <GateCard
              key={n.id}
              node={n}
              selected={selectedNode === n.id}
              onClick={() => setSelectedNode(n.id)}
            />
          ) : (
            <NodeCard
              key={n.id}
              node={n}
              selected={selectedNode === n.id}
              onClick={() => setSelectedNode(n.id)}
            />
          )
        )}
      </div>
    </div>
  )
}
