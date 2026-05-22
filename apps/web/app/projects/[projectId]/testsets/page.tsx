"use client"

import { use } from "react"
import { useRouter } from "next/navigation"
import { notFound } from "next/navigation"
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
import { getProject } from "@/lib/mock/projects"
import { TESTS } from "@/lib/mock/tests"
import { useSetBreadcrumbs } from "@/lib/stores/breadcrumbs"

const statusMap = {
  running: "running",
  passed: "done",
  failed: "err",
} as const

export default function TestsetsListPage({
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
          { label: "Test sets" },
        ]
      : [{ label: "Projects", href: "/projects" }],
  )

  if (!project) notFound()

  // Demo: only the first project has the seeded test sets.
  const testsets = project.id === "shop" ? TESTS : []

  return (
    <>
      <PageHead
        title="Test sets"
        sub={`${testsets.length} test set${testsets.length === 1 ? "" : "s"} in ${project.name}`}
        actions={
          <>
            <div className="border-border bg-card flex h-9 items-center gap-1.5 rounded-md border px-2.5">
              <SearchIcon className="text-ink-4 size-[13px]" />
              <Input
                placeholder="Search test sets…"
                className="h-7 w-[180px] border-0 bg-transparent px-1 text-[13px] shadow-none focus-visible:ring-0"
              />
              <Kbd>⌘K</Kbd>
            </div>
            <Button variant="ghost" size="sm">
              <FilterIcon className="size-[13px]" />
              Filter
            </Button>
            <Button
              variant="accent"
              onClick={() =>
                router.push(`/projects/${project.id}/testsets/new`)
              }
            >
              <PlusIcon className="size-[13px]" />
              New test set
            </Button>
          </>
        }
      />

      <div className="max-w-[1200px] px-6 py-6">
        <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-2">
          <StatCard
            label="Test sets"
            value={String(testsets.length)}
            delta="+1 this week"
          />
          <StatCard
            label="Scripts"
            value="43"
            delta="91% pass rate"
            deltaKind="up"
          />
        </div>

        <div className="mb-3 flex items-end justify-between">
          <div>
            <CapLine>all test sets</CapLine>
            <div className="text-ink-3 mt-0.5 text-[12px]">
              click a test set to open its cases, scripts, and runs
            </div>
          </div>
        </div>

        {testsets.length === 0 ? (
          <div className="border-border bg-card flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
            <div className="text-[15px] font-medium">No test sets yet</div>
            <div className="text-ink-3 mt-1 text-[13px]">
              Start by writing a brief for the feature you want to validate.
            </div>
            <Button
              variant="accent"
              className="mt-5"
              onClick={() =>
                router.push(`/projects/${project.id}/testsets/new`)
              }
            >
              <PlusIcon className="size-[13px]" />
              Create your first test set
            </Button>
          </div>
        ) : (
          <div className="border-border bg-card overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40%]">Test set</TableHead>
                  <TableHead>Last run</TableHead>
                  <TableHead>Cases</TableHead>
                  <TableHead>Scripts</TableHead>
                  <TableHead>Runs</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {testsets.map((t) => (
                  <TableRow
                    key={t.id}
                    className="cursor-pointer"
                    onClick={() =>
                      router.push(`/projects/${project.id}/testsets/${t.id}`)
                    }
                  >
                    <TableCell>
                      <div className="font-medium">{t.name}</div>
                      <div className="text-ink-3 mt-0.5 text-[12px]">
                        {t.desc}
                      </div>
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
        )}
      </div>
    </>
  )
}
