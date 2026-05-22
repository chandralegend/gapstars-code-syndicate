"use client"

import { use, useCallback } from "react"
import { useRouter } from "next/navigation"
import {
  ActivityIcon,
  ChevronRightIcon,
  FlaskConicalIcon,
  PlusIcon,
  Settings2Icon,
} from "lucide-react"

import { CapLine } from "@/components/probe/cap-line"
import { PageHead } from "@/components/probe/page-head"
import { StatCard } from "@/components/probe/stat-card"
import { Button } from "@/components/ui/button"
import {
  getProject,
  listRunsByProject,
  listTestScenarios,
  useFetch,
} from "@/lib/api"
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
  const recentRuns = runs.length

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
    return <div className="text-ink-3 px-6 py-10 text-[13px]">Loading…</div>
  }

  return (
    <>
      <PageHead
        title={project.name}
        sub={project.description}
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
              onClick={() => router.push(`/projects/${project.id}/testsets/new`)}
            >
              <PlusIcon className="size-[13px]" />
              New test set
            </Button>
          </>
        }
      />

      <div className="max-w-[1200px] px-6 py-6">
        <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-3">
          <StatCard
            label="Test sets"
            value={String(scenarios.length)}
            delta={
              scenarios.length === 0 ? "Create your first one" : "+ in this project"
            }
          />
          <StatCard label="Runs" value={String(recentRuns)} delta="lifetime" />
          <StatCard
            label="Tech stack"
            value={
              project.tech_stack ? project.tech_stack.split(",")[0]!.trim() : "—"
            }
          />
        </div>

        {scenarios.length === 0 ? (
          <EmptyState
            onCreate={() => router.push(`/projects/${project.id}/testsets/new`)}
          />
        ) : (
          <>
            <div className="mb-3 flex items-end justify-between">
              <div>
                <CapLine>recent test sets</CapLine>
                <div className="text-ink-3 mt-0.5 text-[12px]">
                  click a test set to open its cases, scripts, and runs
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  router.push(`/projects/${project.id}/testsets`)
                }
              >
                See all
                <ChevronRightIcon className="size-[12px]" />
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {scenarios.slice(0, 6).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() =>
                    router.push(`/projects/${project.id}/testsets/${t.id}`)
                  }
                  className="border-border bg-card hover:border-ink-4/60 group rounded-lg border p-4 text-left transition-colors"
                >
                  <div className="mb-1 flex items-center gap-2">
                    <FlaskConicalIcon className="text-ink-3 size-[14px]" />
                    <span className="text-ink-4 ml-auto font-mono text-[11px]">
                      {t.id.slice(0, 8)}
                    </span>
                  </div>
                  <div className="text-[13.5px] font-medium">{t.title}</div>
                  <div className="text-ink-3 mt-0.5 line-clamp-2 text-[12px]">
                    {t.feature_description}
                  </div>
                  <div className="text-ink-4 mt-3 flex items-center gap-2 font-mono text-[11px]">
                    <span>{t.status}</span>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        <div className="mt-8 grid grid-cols-1 gap-3 md:grid-cols-2">
          <NavCard
            label="Run history"
            desc={`${runs.length} runs across this project`}
            icon={<ActivityIcon className="size-[15px]" />}
            onClick={() => router.push(`/projects/${project.id}/runs`)}
          />
          <NavCard
            label="Settings"
            desc="Project metadata and defaults"
            icon={<Settings2Icon className="size-[15px]" />}
            onClick={() => router.push(`/projects/${project.id}/settings`)}
          />
        </div>
      </div>
    </>
  )
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="border-border bg-card flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
      <div className="bg-muted text-ink-3 grid size-12 place-items-center rounded-full">
        <FlaskConicalIcon className="size-[20px]" />
      </div>
      <div className="mt-3 text-[16px] font-medium">No test sets yet</div>
      <div className="text-ink-3 mt-1 max-w-[420px] text-center text-[13px]">
        A test set bundles a feature&apos;s expectation, generated cases, and
        the scripts that exercise them. Start by writing a brief.
      </div>
      <Button variant="accent" className="mt-5" onClick={onCreate}>
        <PlusIcon className="size-[13px]" />
        Create your first test set
      </Button>
    </div>
  )
}

function NavCard({
  label,
  desc,
  icon,
  onClick,
}: {
  label: string
  desc: string
  icon: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="border-border bg-card hover:border-ink-4/60 flex items-center gap-3 rounded-lg border p-4 text-left transition-colors"
    >
      <div className="bg-muted text-ink-3 grid size-9 place-items-center rounded-md">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-medium">{label}</div>
        <div className="text-ink-3 mt-0.5 text-[12px]">{desc}</div>
      </div>
      <ChevronRightIcon className="text-ink-4 size-[14px]" />
    </button>
  )
}
