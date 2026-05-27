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
import { cn } from "@/lib/utils"

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
              {projects?.map((p, i) => (
                <Link
                  key={p.id}
                  href={`/projects/${p.id}`}
                  className={cn(
                    "probe-slide-in",
                    i === 0 && "probe-stagger-1",
                    i === 1 && "probe-stagger-2",
                    i === 2 && "probe-stagger-3",
                    i === 3 && "probe-stagger-4",
                    i === 4 && "probe-stagger-5",
                    i >= 5 && "probe-stagger-6",
                    "group border-border bg-card flex flex-col rounded-lg border p-5",
                    "hover:-translate-y-0.5 hover:border-accent/40",
                    "dark:hover:shadow-[0_4px_16px_oklch(0.74_0.17_195/0.10)]",
                    "hover:shadow-[0_4px_16px_oklch(0.14_0.02_255/0.08)]",
                    "transition-[border-color,transform,box-shadow] duration-200",
                    "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
                  )}
                >
                  {/* Project name using slightly larger weight for legibility */}
                  <div className="text-md font-medium">{p.name}</div>
                  <p className="text-ink-3 mt-1 line-clamp-2 text-sm leading-relaxed">
                    {p.description}
                  </p>
                  <div className="text-ink-4 mt-4 flex items-center gap-3 text-xs">
                    <span className="flex items-center gap-1">
                      <FlaskConicalIcon aria-hidden className="size-[11px]" />
                      Feature tests
                    </span>
                    {/* Teal tint on the arrow on hover — uses the accent */}
                    <ChevronRightIcon
                      aria-hidden
                      className="ml-auto size-[13px] transition-[transform,color] duration-150 group-hover:translate-x-0.5 group-hover:text-accent"
                    />
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
