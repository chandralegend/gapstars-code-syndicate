"use client"

import { useRouter } from "next/navigation"
import { ChevronRightIcon, FilterIcon, PlusIcon, SearchIcon } from "lucide-react"

import { CapLine } from "@/components/probe/cap-line"
import { Kbd } from "@/components/probe/kbd"
import { PageHead } from "@/components/probe/page-head"
import { StatCard } from "@/components/probe/stat-card"
import { StatusDot } from "@/components/probe/status-dot"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useSetBreadcrumbs } from "@/lib/stores/breadcrumbs"
import { TESTS } from "@/lib/mock/tests"

const statusMap = {
  running: "running",
  passed: "done",
  failed: "err",
} as const

export default function TestsPage() {
  const router = useRouter()
  useSetBreadcrumbs([
    { label: "acme/shop", muted: true },
    { label: "Tests" },
  ])

  return (
    <>
      <PageHead
        title="Tests"
        sub="5 tests · acme/shop · staging.acme.shop"
        actions={
          <>
            <div className="border-border bg-card flex h-9 items-center gap-1.5 rounded-md border px-2.5">
              <SearchIcon className="text-ink-4 size-[13px]" />
              <Input
                placeholder="Search tests…"
                className="h-7 w-[180px] border-0 bg-transparent px-1 text-[13px] shadow-none focus-visible:ring-0"
              />
              <Kbd>⌘K</Kbd>
            </div>
            <Button variant="ghost" size="sm">
              <FilterIcon className="size-[13px]" />
              Filter
            </Button>
            <Button variant="accent" onClick={() => router.push("/tests/new")}>
              <PlusIcon className="size-[13px]" />
              New test
            </Button>
          </>
        }
      />

      <div className="max-w-[1200px] px-6 py-6">
        <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-3">
          <StatCard label="Tests" value="5" delta="+1 this week" />
          <StatCard label="Scripts" value="43" delta="91% pass rate" deltaKind="up" />
          <StatCard
            label="Cost this month"
            value="$48.12"
            unit="of $200 cap"
            delta="$1.91/run avg"
          />
        </div>

        <div className="mb-3 flex items-end justify-between">
          <div>
            <CapLine>all tests</CapLine>
            <div className="text-ink-3 mt-0.5 text-[12px]">
              click a test to open its run history
            </div>
          </div>
        </div>

        <div className="border-border bg-card overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40%]">Test</TableHead>
                <TableHead>Last run</TableHead>
                <TableHead>Cases</TableHead>
                <TableHead>Scripts</TableHead>
                <TableHead>Runs</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {TESTS.map((t) => (
                <TableRow
                  key={t.id}
                  className="cursor-pointer"
                  onClick={() => router.push("/runs/run_018f2c")}
                >
                  <TableCell>
                    <div className="font-medium">{t.name}</div>
                    <div className="text-ink-3 mt-0.5 text-[12px]">{t.desc}</div>
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-2 text-[12.5px]">
                      <StatusDot kind={statusMap[t.status]} />
                      {t.lastRun}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono">{t.cases}</TableCell>
                  <TableCell className="font-mono">{t.scripts}</TableCell>
                  <TableCell className="font-mono">{t.runs}</TableCell>
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
      </div>
    </>
  )
}
