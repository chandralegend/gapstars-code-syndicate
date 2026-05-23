"use client"

import { use, useCallback } from "react"
import { useRouter } from "next/navigation"
import { ChevronRightIcon } from "lucide-react"

import { CapLine } from "@/components/probe/cap-line"
import { PageHead } from "@/components/probe/page-head"
import { RunStatusBadge } from "@/components/probe/run-status-badge"
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
import { RelativeTime } from "@/lib/format"
import { nodeLabel } from "@/lib/labels"
import { useSetBreadcrumbs } from "@/lib/stores/breadcrumbs"

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
          { label: "Runs" },
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
  const failed = runs.filter((r) => r.status === "failed").length
  const subtitleParts: string[] = []
  if (active > 0) subtitleParts.push(`${active} active`)
  subtitleParts.push(`${runs.length} total`)
  if (failed > 0) subtitleParts.push(`${failed} failed`)

  return (
    <>
      <PageHead
        title="Runs"
        sub={`${subtitleParts.join(" · ")} · across ${project.name}`}
      />

      <div className="max-w-[1200px] px-6 py-6">
        <div className="mb-3">
          <CapLine>recent runs</CapLine>
          <div className="text-ink-3 mt-0.5 text-[12px]">
            click a run to open its live timeline
          </div>
        </div>

        {runs.length === 0 ? (
          <div className="border-border bg-card rounded-lg border border-dashed py-12 text-center">
            <div className="text-ink-3 text-[13px]">
              No runs yet. Open a feature test to kick one off.
            </div>
          </div>
        ) : (
          <div className="border-border bg-card overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Run</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Step</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((r) => (
                  <TableRow
                    key={r.id}
                    className="cursor-pointer"
                    onClick={() =>
                      router.push(`/projects/${project.id}/runs/${r.id}`)
                    }
                  >
                    <TableCell className="font-mono text-[12px]">
                      #{r.id.slice(0, 8)}
                    </TableCell>
                    <TableCell>
                      <RunStatusBadge status={r.status} />
                    </TableCell>
                    <TableCell className="text-ink-3 text-[12.5px]">
                      {r.current_node ? nodeLabel(r.current_node) : "—"}
                    </TableCell>
                    <TableCell className="text-ink-3 text-[12.5px]">
                      <RelativeTime iso={r.created_at} />
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm">
                        Open
                        <ChevronRightIcon className="size-[12px]" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </>
  )
}
