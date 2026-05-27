"use client"

import { use, useCallback } from "react"
import { useRouter } from "next/navigation"
import { ActivityIcon, ChevronRightIcon } from "lucide-react"

import { CapLine } from "@/components/probe/cap-line"
import { PageHead } from "@/components/probe/page-head"
import { RunStatusBadge } from "@/components/probe/run-status-badge"
import { PageContainer } from "@/components/shell/page-container"
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
    return (
      <div role="status" aria-label="Loading runs" className="px-6 py-10 space-y-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="border-border flex items-center gap-4 rounded-lg border px-4 py-3">
            <div className="bg-muted h-4 w-20 animate-pulse rounded motion-reduce:animate-none" />
            <div className="bg-muted h-4 flex-1 animate-pulse rounded motion-reduce:animate-none" />
            <div className="bg-muted h-5 w-16 animate-pulse rounded motion-reduce:animate-none" />
          </div>
        ))}
        <span className="sr-only">Loading runs…</span>
      </div>
    )
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
    <PageContainer>
      <PageHead
        title="Runs"
        sub={`${subtitleParts.join(" · ")} · across ${project.name}`}
      />

      <div className="py-6">
        <div className="mb-3">
          <CapLine>recent runs</CapLine>
          <div className="text-ink-3 mt-0.5 text-[12px]">
            click a run to open its live timeline
          </div>
        </div>

        {runs.length === 0 ? (
          <div className="border-border bg-card flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
            <div className="bg-muted text-ink-3 grid size-12 place-items-center rounded-full">
              <ActivityIcon aria-hidden className="size-5" />
            </div>
            <div className="mt-3 text-base font-medium">No runs yet</div>
            <p className="text-ink-3 mt-1 max-w-[380px] text-sm">
              A run takes a feature test through all five phases — brief, sandbox, test cases, scripts, and execution.
            </p>
            <Button
              variant="accent"
              className="mt-5"
              onClick={() => router.push(`/projects/${projectId}/testsets`)}
            >
              Open a feature test
            </Button>
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
    </PageContainer>
  )
}
