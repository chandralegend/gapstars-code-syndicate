"use client"

import { use } from "react"
import { notFound } from "next/navigation"

import { RightPanel } from "@/components/screens/run/right-panel"
import { Timeline } from "@/components/screens/run/timeline"
import { AGENT_NODES } from "@/lib/mock/agent-nodes"
import { getProject } from "@/lib/mock/projects"
import { useSetBreadcrumbs } from "@/lib/stores/breadcrumbs"
import { useRunView } from "@/lib/stores/run-view"
import type { RunNode } from "@/lib/types"

export default function ProjectRunDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; runId: string }>
}) {
  const { projectId, runId } = use(params)
  const project = getProject(projectId)
  const selectedNode = useRunView((s) => s.selectedNode)
  const gate1Approved = useRunView((s) => s.gate1Approved)

  useSetBreadcrumbs(
    project
      ? [
          { label: "Projects", href: "/projects" },
          { label: project.name, href: `/projects/${project.id}` },
          {
            label: "Test sets",
            href: `/projects/${project.id}/testsets`,
            muted: true,
          },
          { label: "Saved Carts", muted: true, href: `/projects/${project.id}/testsets/t_104` },
          { label: runId, mono: true },
        ]
      : [],
    "run"
  )

  if (!project) notFound()

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
