"use client"

import { use, useCallback } from "react"
import { useRouter } from "next/navigation"
import {
  ChevronRightIcon,
  FlaskConicalIcon,
  PlusIcon,
  Settings2Icon,
} from "lucide-react"

import { CapLine } from "@/components/probe/cap-line"
import { PageHead } from "@/components/probe/page-head"
import { RunStatusBadge } from "@/components/probe/run-status-badge"
import { PageContainer } from "@/components/shell/page-container"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  getProject,
  listRunsByProject,
  listTestScenarios,
  useFetch,
} from "@/lib/api"
import { RelativeTime } from "@/lib/format"
import {
  isActiveRun,
  scenarioStatusLabel,
  scenarioStatusTone,
} from "@/lib/labels"
import { useSetBreadcrumbs } from "@/lib/stores/breadcrumbs"

export default function ProjectOverviewPage({
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
  const runsQ = useFetch(
    useCallback(() => listRunsByProject(projectId), [projectId]),
    [projectId],
  )

  const project = projectQ.data
  const scenarios = scenariosQ.data ?? []
  const runs = runsQ.data ?? []
  const activeRuns = runs.filter((r) => isActiveRun(r.status))
  const reviewRuns = runs.filter(
    (r) => r.status === "agent1_review" || r.status === "agent3_review",
  )
  const failedRuns = runs.filter((r) => r.status === "failed")
  const liveRun =
    activeRuns[0] ?? reviewRuns[0] ?? null

  useSetBreadcrumbs(
    project
      ? [
          { label: "Projects", href: "/projects" },
          { label: project.name },
        ]
      : [{ label: "Projects", href: "/projects" }, { label: projectId, mono: true }],
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
      <div role="status" aria-label="Loading" className="px-6 py-10 space-y-3">
        <div className="bg-muted h-7 w-48 animate-pulse rounded motion-reduce:animate-none" />
        <div className="bg-muted h-4 w-full animate-pulse rounded motion-reduce:animate-none" />
        <div className="grid gap-4 pt-4 sm:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="border-border bg-card space-y-2 rounded-lg border p-4">
              <div className="bg-muted h-4 w-2/3 animate-pulse rounded motion-reduce:animate-none" />
              <div className="bg-muted h-3 w-full animate-pulse rounded motion-reduce:animate-none" />
            </div>
          ))}
        </div>
        <span className="sr-only">Loading…</span>
      </div>
    )
  }

  const subtitleParts: string[] = [
    `${scenarios.length} feature test${scenarios.length === 1 ? "" : "s"}`,
    ...(activeRuns.length > 0
      ? [`${activeRuns.length} active run${activeRuns.length === 1 ? "" : "s"}`]
      : []),
    ...(reviewRuns.length > 0 ? [`${reviewRuns.length} awaiting review`] : []),
    ...(failedRuns.length > 0 ? [`${failedRuns.length} failed`] : []),
  ]

  return (
    <PageContainer>
      <PageHead
        title={project.name}
        sub={
          <span className="block">
            <span className="block">{project.description}</span>
            <span className="text-ink-3 mt-1 block text-[12px]">
              {subtitleParts.join(" · ")}
            </span>
          </span>
        }
        actions={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push(`/projects/${project.id}/settings`)}
            >
              <Settings2Icon className="size-[13px]" />
              Settings
            </Button>
            <Button
              variant="accent"
              onClick={() =>
                router.push(`/projects/${project.id}/testsets/new`)
              }
            >
              <PlusIcon className="size-[13px]" />
              New feature test
            </Button>
          </>
        }
      />

      <div className="py-6">
        {liveRun && (
          <button
            type="button"
            onClick={() =>
              router.push(`/projects/${project.id}/runs/${liveRun.id}`)
            }
            className="border-border bg-card hover:border-ink-4/60 hover:bg-muted/30 focus-visible:ring-foreground/30 mb-6 flex w-full cursor-pointer items-center gap-4 rounded-lg border p-4 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[11.5px] font-medium tracking-wide uppercase text-ink-3">
                  {isActiveRun(liveRun.status) ? "In progress" : "Awaiting review"}
                </span>
                <RunStatusBadge status={liveRun.status} />
              </div>
              <div className="mt-1 font-mono text-[12.5px]">
                Run #{liveRun.id.slice(0, 8)}
              </div>
              <div className="text-ink-3 mt-0.5 text-[11.5px]">
                Started <RelativeTime iso={liveRun.created_at} />
              </div>
            </div>
            <span className="text-ink-3 inline-flex items-center gap-1 text-[12.5px]">
              Open
              <ChevronRightIcon aria-hidden className="size-[13px]" />
            </span>
          </button>
        )}

        {scenarios.length === 0 ? (
          <EmptyState
            onCreate={() =>
              router.push(`/projects/${project.id}/testsets/new`)
            }
          />
        ) : (
          <>
            <div className="mb-3 flex items-end justify-between">
              <div>
                <CapLine>recent feature tests</CapLine>
                <div className="text-ink-3 mt-0.5 text-[12px]">
                  click a feature test to view its brief and runs
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push(`/projects/${project.id}/testsets`)}
              >
                See all
                <ChevronRightIcon aria-hidden className="size-[12px]" />
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {scenarios.slice(0, 6).map((t) => {
                const tone = scenarioStatusTone(t.status)
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() =>
                      router.push(
                        `/projects/${project.id}/testsets/${t.id}`,
                      )
                    }
                    className="border-border bg-card hover:border-ink-4/60 hover:bg-muted/30 focus-visible:ring-foreground/30 group cursor-pointer rounded-lg border p-4 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none"
                  >
                    <div className="mb-1 flex items-center gap-2">
                      <FlaskConicalIcon aria-hidden className="text-ink-3 size-[14px]" />
                      <Badge
                        variant={tone === "muted" ? "muted" : tone}
                        className="ml-auto"
                      >
                        {scenarioStatusLabel(t.status)}
                      </Badge>
                    </div>
                    <div className="text-[13.5px] font-medium">{t.title}</div>
                    <div className="text-ink-3 mt-0.5 line-clamp-2 text-[12px]">
                      {t.feature_description}
                    </div>
                    <div className="text-ink-3 mt-3 text-[11px]">
                      <RelativeTime iso={t.created_at} />
                    </div>
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>
    </PageContainer>
  )
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="border-border bg-card flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
      <div className="bg-muted text-ink-3 grid size-12 place-items-center rounded-full">
        <FlaskConicalIcon aria-hidden className="size-[20px]" />
      </div>
      <div className="mt-3 text-[16px] font-medium">No feature tests yet</div>
      <div className="text-ink-3 mt-1 max-w-[420px] text-center text-sm">
        Feature tests define what to check and how. Create one to start a QA run.
      </div>
      <Button variant="accent" className="mt-6" onClick={onCreate}>
        <PlusIcon className="size-[13px]" />
        New feature test
      </Button>
    </div>
  )
}
