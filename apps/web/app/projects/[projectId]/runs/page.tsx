"use client"

import { use, useCallback } from "react"
import { useRouter } from "next/navigation"
import { ChevronRightIcon } from "lucide-react"

import { CapLine } from "@/components/probe/cap-line"
import { PageHead } from "@/components/probe/page-head"
import { StatCard } from "@/components/probe/stat-card"
import { StatusDot } from "@/components/probe/status-dot"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { getProject, listRunsByProject, useFetch } from "@/lib/api"
import { useSetBreadcrumbs } from "@/lib/stores/breadcrumbs"

const RUN_STATUS_DOT: Record<
  string,
  { kind: "running" | "done" | "err" | "wait"; label: string }
> = {
  pending: { kind: "wait", label: "pending" },
  agent1_running: { kind: "running", label: "agent 1 running" },
  agent1_review: { kind: "wait", label: "awaiting review" },
  agent2_running: { kind: "running", label: "agent 2 running" },
  agent3_running: { kind: "running", label: "agent 3 running" },
  agent3_review: { kind: "wait", label: "awaiting review" },
  completed: { kind: "done", label: "completed" },
  failed: { kind: "err", label: "failed" },
}

export default function ProjectRunsPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = use(params)
  const router = useRouter()

  const projectQ = useFetch(
    useCallback(() => getProject(projectId), [projectId]),
    [projectId],
  )
  const runsQ = useFetch(
    useCallback(() => listRunsByProject(projectId), [projectId]),
    [projectId],
  )
  const project = projectQ.data
  const runs = runsQ.data ?? []

  useSetBreadcrumbs(
    project
      ? [
          { label: "Projects", href: "/projects" },
          { label: project.name, href: `/projects/${project.id}` },
          { label: "Run history" },
        ]
      : [{ label: "Projects", href: "/projects" }],
  )

  if (projectQ.error) {
    return (
      <div className="px-6 py-10 text-center">
        <h1 className="text-[20px] font-semibold">Project not found</h1>
        <p className="text-ink-3 mt-1 text-[13px]">{projectQ.error.message}</p>
      </div>
    )
  }
  if (!project) {
    return <div className="text-ink-3 px-6 py-10 text-[13px]">Loading…</div>
  }

  const active = runs.filter(
    (r) => !["completed", "failed"].includes(r.status),
  ).length

  return (
    <>
      <PageHead title="Runs" sub={`Across all test sets in ${project.name}`} />

      <div className="max-w-[1200px] px-6 py-6">
        <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-3">
          <StatCard label="Active runs" value={String(active)} />
          <StatCard label="Total runs" value={String(runs.length)} />
          <StatCard
            label="Failed"
            value={String(runs.filter((r) => r.status === "failed").length)}
          />
        </div>

        <div className="mb-3">
          <CapLine>recent runs</CapLine>
          <div className="text-ink-3 mt-0.5 text-[12px]">
            click a run to open its live timeline
          </div>
        </div>

        {runs.length === 0 ? (
          <div className="border-border bg-card rounded-lg border border-dashed py-12 text-center">
            <div className="text-ink-3 text-[13px]">No runs yet.</div>
          </div>
        ) : (
          <div className="border-border bg-card overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Run</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Node</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((r) => {
                  const meta =
                    RUN_STATUS_DOT[r.status] ?? {
                      kind: "wait" as const,
                      label: r.status,
                    }
                  return (
                    <TableRow
                      key={r.id}
                      className="cursor-pointer"
                      onClick={() =>
                        router.push(`/projects/${project.id}/runs/${r.id}`)
                      }
                    >
                      <TableCell className="font-mono text-[12px]">
                        {r.id.slice(0, 8)}
                      </TableCell>
                      <TableCell>
                        <span className="flex items-center gap-2 text-[12.5px]">
                          <StatusDot kind={meta.kind} />
                          {meta.label}
                        </span>
                      </TableCell>
                      <TableCell className="text-ink-3 font-mono text-[12px]">
                        {r.current_node ?? "—"}
                      </TableCell>
                      <TableCell className="text-ink-3">
                        {new Date(r.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm">
                          Open
                          <ChevronRightIcon className="size-[12px]" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </>
  )
}
