"use client"

import { use } from "react"
import { useRouter } from "next/navigation"
import { notFound } from "next/navigation"
import {
  ActivityIcon,
  ChevronRightIcon,
  CodeIcon,
  FlaskConicalIcon,
  PlusIcon,
  Settings2Icon,
} from "lucide-react"

import { CapLine } from "@/components/probe/cap-line"
import { PageHead } from "@/components/probe/page-head"
import { StatCard } from "@/components/probe/stat-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { getProject } from "@/lib/mock/projects"
import { TESTS } from "@/lib/mock/tests"
import { useSetBreadcrumbs } from "@/lib/stores/breadcrumbs"

export default function ProjectOverviewPage({
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
          { label: project.name },
        ]
      : [{ label: "Projects", href: "/projects" }, { label: projectId, mono: true }],
  )

  if (!project) {
    notFound()
  }

  // For demo, we treat TESTS as the test sets that belong to the *first* project.
  const testsets = project.id === "shop" ? TESTS : []

  return (
    <>
      <PageHead
        title={project.name}
        sub={
          <span className="flex items-center gap-2">
            <Badge variant={project.status === "active" ? "ok" : "muted"}>
              {project.status}
            </Badge>
            <span>{project.description}</span>
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
            value={String(testsets.length)}
            delta={`${testsets.length === 0 ? "Create your first one" : "+1 this week"}`}
          />
          <StatCard
            label="Runs this week"
            value={String(project.runsThisWeek)}
            delta="+8 vs last week"
            deltaKind={project.runsThisWeek > 0 ? "up" : undefined}
          />
          <StatCard label="Staging" value={project.stagingUrl} />
        </div>

        {testsets.length === 0 ? (
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
                onClick={() => router.push(`/projects/${project.id}/testsets`)}
              >
                See all
                <ChevronRightIcon className="size-[12px]" />
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {testsets.slice(0, 3).map((t) => (
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
                      {t.id}
                    </span>
                  </div>
                  <div className="text-[13.5px] font-medium">{t.name}</div>
                  <div className="text-ink-3 mt-0.5 line-clamp-2 text-[12px]">
                    {t.desc}
                  </div>
                  <div className="text-ink-4 mt-3 flex items-center gap-2 font-mono text-[11px]">
                    <span>{t.cases} cases</span>
                    <span>·</span>
                    <span>{t.scripts} scripts</span>
                    <span>·</span>
                    <span>{t.runs} runs</span>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        <div className="mt-8 grid grid-cols-1 gap-3 md:grid-cols-2">
          <Link
            label="Run history"
            desc="Every run across this project"
            icon={<ActivityIcon className="size-[15px]" />}
            onClick={() => router.push(`/projects/${project.id}/runs`)}
          />
          <Link
            label="Scripts"
            desc="Generated, runnable without LLM"
            icon={<CodeIcon className="size-[15px]" />}
            onClick={() => router.push(`/projects/${project.id}/scripts`)}
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

function Link({
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
