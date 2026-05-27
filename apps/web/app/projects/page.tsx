"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ChevronRightIcon,
  FlaskConicalIcon,
  PlusIcon,
} from "lucide-react"

import { CapLine } from "@/components/probe/cap-line"
import { PageHead } from "@/components/probe/page-head"
import { PageContainer } from "@/components/shell/page-container"
import { Button } from "@/components/ui/button"
import { listProjects, useFetch } from "@/lib/api"
import { useSetBreadcrumbs } from "@/lib/stores/breadcrumbs"

export default function ProjectsPage() {
  useSetBreadcrumbs([{ label: "Projects" }], "none")
  const router = useRouter()

  const { data: projects, error, loading } = useFetch(listProjects)
  const count = projects?.length ?? 0
  const hasProjects = count > 0

  return (
    <PageContainer>
      <PageHead
        title="Projects"
        sub={
          loading
            ? "Loading…"
            : `${count} project${count === 1 ? "" : "s"}`
        }
        actions={
          <Button variant="accent" onClick={() => router.push("/onboard")}>
            <PlusIcon className="size-[13px]" />
            New project
          </Button>
        }
      />

      <div className="py-6">
        {error && (
          <div className="border-err/40 bg-err-soft text-err-ink mb-4 rounded-md border p-3 text-[13px]">
            Could not load projects: {error.message}
          </div>
        )}

        {loading && !projects && (
          <div role="status" aria-label="Loading projects" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="border-border bg-card space-y-3 rounded-lg border p-5">
                <div className="bg-muted h-4 w-3/4 animate-pulse rounded motion-reduce:animate-none" />
                <div className="bg-muted h-3 w-full animate-pulse rounded motion-reduce:animate-none" />
                <div className="bg-muted h-3 w-2/3 animate-pulse rounded motion-reduce:animate-none" />
              </div>
            ))}
            <span className="sr-only">Loading projects…</span>
          </div>
        )}

        {!loading && !hasProjects && !error && (
          <div className="border-border bg-card flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
            <div className="bg-muted text-ink-3 grid size-12 place-items-center rounded-full">
              <FlaskConicalIcon className="size-[20px]" />
            </div>
            <div className="mt-3 text-[16px] font-medium">
              No projects yet
             </div>
             <p className="text-ink-3 mt-1 max-w-[440px] text-sm">
               Projects group your feature tests and QA runs. Create one to get started.
             </p>
             <Button
               variant="accent"
               className="mt-6"
               onClick={() => router.push("/onboard")}
             >
               <PlusIcon className="size-[13px]" />
              New project
            </Button>
          </div>
        )}

        {hasProjects && (
          <>
            <div className="mb-3">
              <CapLine>projects</CapLine>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {projects?.map((p) => (
                <Link
                  key={p.id}
                  href={`/projects/${p.id}`}
                  className="border-border bg-card hover:border-ink-4/60 focus-visible:ring-foreground/30 flex flex-col rounded-lg border p-5 transition-colors focus-visible:ring-2 focus-visible:outline-none"
                >
                  <div className="text-[15px] font-medium">{p.name}</div>
                  <p className="text-ink-3 mt-1 line-clamp-2 text-[12.5px] leading-relaxed">
                    {p.description}
                  </p>
                  <div className="text-ink-4 mt-4 flex items-center gap-3 text-[11.5px]">
                    <span className="flex items-center gap-1">
                      <FlaskConicalIcon className="size-[11px]" />
                      Open feature tests
                    </span>
                    <span className="ml-auto inline-flex items-center gap-0.5">
                      open
                      <ChevronRightIcon className="size-[12px]" />
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </PageContainer>
  )
}
