"use client"

import { use, useCallback } from "react"
import { useRouter } from "next/navigation"
import { ChevronRightIcon, PlusIcon } from "lucide-react"

import { CapLine } from "@/components/probe/cap-line"
import { PageHead } from "@/components/probe/page-head"
import { PageContainer } from "@/components/shell/page-container"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { getProject, listTestScenarios, useFetch } from "@/lib/api"
import { RelativeTime } from "@/lib/format"
import { scenarioStatusLabel, scenarioStatusTone } from "@/lib/labels"
import { useSetBreadcrumbs } from "@/lib/stores/breadcrumbs"

export default function TestsetsListPage({
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
  const scenariosQ = useFetch(
    useCallback(() => listTestScenarios(projectId), [projectId]),
    [projectId],
  )

  const project = projectQ.data
  const scenarios = scenariosQ.data ?? []
  const drafts = scenarios.filter((s) => s.status === "draft").length
  const inProgress = scenarios.filter((s) => s.status === "in_progress").length

  useSetBreadcrumbs(
    project
      ? [
          { label: "Projects", href: "/projects" },
          { label: project.name, href: `/projects/${project.id}` },
          { label: "Feature tests" },
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

  const subtitleParts: string[] = [
    `${scenarios.length} total`,
    ...(drafts > 0 ? [`${drafts} draft`] : []),
    ...(inProgress > 0 ? [`${inProgress} in progress`] : []),
  ]

  return (
    <PageContainer>
      <PageHead
        title="Feature tests"
        sub={`${subtitleParts.join(" · ")} · in ${project.name}`}
        actions={
          <Button
            variant="accent"
            onClick={() => router.push(`/projects/${project.id}/testsets/new`)}
          >
            <PlusIcon className="size-[13px]" />
            New feature test
          </Button>
        }
      />

      <div className="py-6">
        {scenarios.length === 0 ? (
          <div className="border-border bg-card flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
            <div className="text-[15px] font-medium">No feature tests yet</div>
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
              Create your first feature test
            </Button>
          </div>
        ) : (
          <>
            <div className="mb-3">
              <CapLine>all feature tests</CapLine>
              <div className="text-ink-3 mt-0.5 text-[12px]">
                click a feature test to view its brief and runs
              </div>
            </div>
            <div className="border-border bg-card overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[55%]">Feature test</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scenarios.map((t) => {
                    const tone = scenarioStatusTone(t.status)
                    return (
                      <TableRow
                        key={t.id}
                        className="cursor-pointer"
                        onClick={() =>
                          router.push(
                            `/projects/${project.id}/testsets/${t.id}`,
                          )
                        }
                      >
                        <TableCell>
                          <div className="font-medium">{t.title}</div>
                          <div className="text-ink-3 mt-0.5 line-clamp-2 text-[12px]">
                            {t.feature_description}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={tone === "muted" ? "muted" : tone}>
                            {scenarioStatusLabel(t.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-ink-3 text-[12.5px]">
                          <RelativeTime iso={t.created_at} />
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
          </>
        )}
      </div>
    </PageContainer>
  )
}
