"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { ChevronRightIcon, FlaskConicalIcon, PlusIcon } from "lucide-react"

import { CapLine } from "@/components/probe/cap-line"
import { PageHead } from "@/components/probe/page-head"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { PROJECTS } from "@/lib/mock/projects"
import { useSetBreadcrumbs } from "@/lib/stores/breadcrumbs"

const STATUS_VARIANT = {
  active: "ok",
  draft: "muted",
  archived: "muted",
} as const

export default function ProjectsPage() {
  useSetBreadcrumbs([{ label: "Projects" }], "none")
  const router = useRouter()

  return (
    <>
      <PageHead
        title="Projects"
        sub={`${PROJECTS.length} projects`}
        actions={
          <Button variant="accent" onClick={() => router.push("/onboard")}>
            <PlusIcon className="size-[13px]" />
            New project
          </Button>
        }
      />

      <div className="max-w-[1200px] px-6 py-6">
        <div className="mb-3">
          <CapLine>your projects</CapLine>
          <div className="text-ink-3 mt-0.5 text-[12px]">
            each project owns its own test sets, scripts, and run history
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {PROJECTS.map((p) => (
            <Link
              key={p.id}
              href={`/projects/${p.id}`}
              className="border-border bg-card hover:border-ink-4/60 flex flex-col rounded-lg border p-5 transition-colors"
            >
              <div className="mb-1 flex items-center gap-2">
                <Badge variant={STATUS_VARIANT[p.status]}>{p.status}</Badge>
                <span className="text-ink-4 ml-auto font-mono text-[11px]">
                  {p.id}
                </span>
              </div>
              <div className="mt-1 text-[15px] font-medium">{p.name}</div>
              <p className="text-ink-3 mt-1 line-clamp-2 text-[12.5px] leading-relaxed">
                {p.description}
              </p>
              <div className="text-ink-4 mt-4 flex items-center gap-3 font-mono text-[11px]">
                <span className="flex items-center gap-1">
                  <FlaskConicalIcon className="size-[11px]" />
                  {p.testsetCount} test set{p.testsetCount === 1 ? "" : "s"}
                </span>
                <span>{p.runsThisWeek} runs / week</span>
                <span className="ml-auto inline-flex items-center gap-0.5">
                  open
                  <ChevronRightIcon className="size-[12px]" />
                </span>
              </div>
            </Link>
          ))}

          <button
            type="button"
            onClick={() => router.push("/onboard")}
            className="border-border text-ink-3 hover:border-ink-4/60 hover:text-foreground flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-8 text-center transition-colors"
          >
            <PlusIcon className="size-[18px]" />
            <span className="text-[13px] font-medium">New project</span>
            <span className="text-ink-4 text-[11.5px]">
              Run onboarding to seed context, personas, and rules
            </span>
          </button>
        </div>
      </div>
    </>
  )
}
