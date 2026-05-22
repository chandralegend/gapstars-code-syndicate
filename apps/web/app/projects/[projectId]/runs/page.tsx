"use client"

import { use } from "react"
import { useRouter } from "next/navigation"
import { notFound } from "next/navigation"
import { ChevronRightIcon, DownloadIcon, FilterIcon } from "lucide-react"

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
import { getProject } from "@/lib/mock/projects"
import { RECENT_RUNS } from "@/lib/mock/recent-runs"
import { useSetBreadcrumbs } from "@/lib/stores/breadcrumbs"

const STATUS_MAP = {
  running: { kind: "running" as const, label: "running" },
  done: { kind: "done" as const, label: "done" },
  err: { kind: "err" as const, label: "error" },
}

export default function ProjectRunsPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = use(params)
  const router = useRouter()
  const project = getProject(projectId)

  useSetBreadcrumbs(
    project
      ? [
          { label: "Projects", href: "/projects" },
          { label: project.name, href: `/projects/${project.id}` },
          { label: "Run history" },
        ]
      : [{ label: "Projects", href: "/projects" }],
  )

  if (!project) notFound()

  const runs = project.id === "shop" ? RECENT_RUNS : []

  return (
    <>
      <PageHead
        title="Runs"
        sub={`${project.runsThisWeek} runs this week · across all test sets in ${project.name}`}
        actions={
          <>
            <Button variant="ghost" size="sm">
              <FilterIcon className="size-[13px]" />
              Filter
            </Button>
            <Button variant="ghost" size="sm">
              <DownloadIcon className="size-[13px]" />
              Export CSV
            </Button>
          </>
        }
      />

      <div className="max-w-[1200px] px-6 py-6">
        <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-3">
          <StatCard
            label="Active runs"
            value="1"
            delta="run_018f2c · 2m elapsed"
          />
          <StatCard
            label="Runs this week"
            value={String(project.runsThisWeek)}
            delta="+8 vs last week"
            deltaKind={project.runsThisWeek > 0 ? "up" : undefined}
          />
          <StatCard label="Avg duration" value="3m 41s" delta="P95 6m 12s" />
        </div>

        <div className="mb-3">
          <CapLine>recent runs</CapLine>
          <div className="text-ink-3 mt-0.5 text-[12px]">
            live updates via SSE — every checkpoint streams here
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
                  <TableHead>Test set</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Cases</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((r) => {
                  const s = STATUS_MAP[r.status]
                  return (
                    <TableRow
                      key={r.id}
                      className="cursor-pointer"
                      onClick={() =>
                        r.status === "running" &&
                        router.push(`/projects/${project.id}/runs/${r.id}`)
                      }
                    >
                      <TableCell className="font-mono text-[12px]">
                        {r.id}
                      </TableCell>
                      <TableCell>{r.test}</TableCell>
                      <TableCell>
                        <span className="flex items-center gap-2 text-[12.5px]">
                          <StatusDot kind={s.kind} />
                          {s.label}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono">{r.duration}</TableCell>
                      <TableCell className="font-mono">{r.cases}</TableCell>
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
