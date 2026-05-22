"use client"

import { useRouter } from "next/navigation"
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
import { RECENT_RUNS } from "@/lib/mock/recent-runs"
import { useSetBreadcrumbs } from "@/lib/stores/breadcrumbs"

const STATUS_MAP = {
  running: { kind: "running" as const, label: "running" },
  done: { kind: "done" as const, label: "done" },
  err: { kind: "err" as const, label: "error" },
}

export default function RunsPage() {
  useSetBreadcrumbs([
    { label: "acme/shop", muted: true },
    { label: "Run history" },
  ])
  const router = useRouter()

  return (
    <>
      <PageHead
        title="Runs"
        sub="Across all tests in acme/shop · 142 total this month"
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
            value="34"
            delta="+8 vs last week"
            deltaKind="up"
          />
          <StatCard label="Avg duration" value="3m 41s" delta="P95 6m 12s" />
        </div>

        <div className="mb-3">
          <CapLine>recent runs</CapLine>
          <div className="text-ink-3 mt-0.5 text-[12px]">
            live updates via SSE — every checkpoint streams here
          </div>
        </div>

        <div className="border-border bg-card overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Run</TableHead>
                <TableHead>Test</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Cases</TableHead>
                <TableHead>Cost</TableHead>
                <TableHead>By</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {RECENT_RUNS.map((r) => {
                const s = STATUS_MAP[r.status]
                return (
                  <TableRow
                    key={r.id}
                    className="cursor-pointer"
                    onClick={() =>
                      r.status === "running" && router.push(`/runs/${r.id}`)
                    }
                  >
                    <TableCell className="font-mono text-[12px]">{r.id}</TableCell>
                    <TableCell>{r.test}</TableCell>
                    <TableCell>
                      <span className="flex items-center gap-2 text-[12.5px]">
                        <StatusDot kind={s.kind} />
                        {s.label}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono">{r.duration}</TableCell>
                    <TableCell className="font-mono">{r.cases}</TableCell>
                    <TableCell className="font-mono">{r.cost}</TableCell>
                    <TableCell>{r.by}</TableCell>
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
      </div>
    </>
  )
}
