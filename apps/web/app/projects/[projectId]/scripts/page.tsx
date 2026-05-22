"use client"

import { use, useState } from "react"
import { notFound } from "next/navigation"
import { CodeIcon, DownloadIcon, PlayIcon } from "lucide-react"

import { CapLine } from "@/components/probe/cap-line"
import { PageHead } from "@/components/probe/page-head"
import { StatCard } from "@/components/probe/stat-card"
import { StatusDot } from "@/components/probe/status-dot"
import { Tag } from "@/components/probe/tag"
import { ScriptDrawer } from "@/components/screens/scripts/script-drawer"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { getProject } from "@/lib/mock/projects"
import { SCRIPTS } from "@/lib/mock/scripts"
import { useSetBreadcrumbs } from "@/lib/stores/breadcrumbs"
import type { Script } from "@/lib/types"

export default function ScriptsRollupPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = use(params)
  const project = getProject(projectId)

  useSetBreadcrumbs(
    project
      ? [
          { label: "Projects", href: "/projects" },
          { label: project.name, href: `/projects/${project.id}` },
          { label: "Scripts" },
        ]
      : [{ label: "Projects", href: "/projects" }],
  )

  const [running, setRunning] = useState<string | null>(null)
  const [drawer, setDrawer] = useState<Script | null>(null)

  if (!project) notFound()

  const scripts = project.id === "shop" ? SCRIPTS : []

  const handleRun = (s: Script) => {
    setRunning(s.id)
    setDrawer(s)
    setTimeout(() => setRunning(null), 2400)
  }

  return (
    <>
      <PageHead
        title="Scripts"
        sub={`${scripts.length} generated · cached, runnable without LLM · across all test sets in ${project.name}`}
        actions={
          <>
            <Button variant="ghost" size="sm">
              <DownloadIcon className="size-[13px]" />
              Export
            </Button>
            <Button variant="accent">
              <PlayIcon className="size-[11px]" />
              Run all
            </Button>
          </>
        }
      />

      <div className="max-w-[1200px] px-6 py-6">
        <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-3">
          <StatCard
            label="Scripts"
            value={String(scripts.length)}
            delta="2 frameworks"
          />
          <StatCard
            label="Pass rate"
            value="80%"
            delta="4 of 5 passing"
            deltaKind="up"
          />
          <StatCard
            label="Median runtime"
            value="4.6"
            unit="s"
            delta="cache hit 100%"
          />
        </div>

        <div className="mb-3">
          <CapLine>generated scripts</CapLine>
          <div className="text-ink-3 mt-0.5 text-[12px]">
            cache key includes feature_spec_version · regenerates on edit
          </div>
        </div>

        {scripts.length === 0 ? (
          <div className="border-border bg-card rounded-lg border border-dashed py-12 text-center">
            <div className="text-ink-3 text-[13px]">
              No scripts yet. Create a test set first.
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {scripts.map((s) => (
              <div
                key={s.id}
                className="border-border bg-card hover:border-ink-4/50 grid grid-cols-[auto_1fr_auto] items-center gap-4 rounded-lg border px-4 py-3 transition-colors"
              >
                <Tag>{s.lang}</Tag>
                <div className="min-w-0">
                  <div className="truncate text-[13.5px] font-medium">
                    {s.name}
                  </div>
                  <div className="text-ink-3 mt-0.5 text-[12px]">
                    <span className="font-mono">{s.id}</span>
                    {" · "}last run {s.lastRun}
                    {" · "}
                    {s.status === "passed" && (
                      <span className="text-ok-ink">passed in {s.duration}</span>
                    )}
                    {s.status === "failed" && (
                      <span className="text-err">failed in {s.duration}</span>
                    )}
                    {s.status === "draft" && (
                      <span className="text-ink-4">draft</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {s.status === "passed" && <Badge variant="ok">passed</Badge>}
                  {s.status === "failed" && <Badge variant="err">failed</Badge>}
                  {s.status === "draft" && <Badge variant="muted">draft</Badge>}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDrawer(s)}
                  >
                    <CodeIcon className="size-[13px]" />
                    View
                  </Button>
                  <Button size="sm" onClick={() => handleRun(s)}>
                    {running === s.id ? (
                      <>
                        <StatusDot kind="running" size={6} />
                        Running…
                      </>
                    ) : (
                      <>
                        <PlayIcon className="size-[11px]" />
                        Run
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {drawer && (
        <ScriptDrawer
          script={drawer}
          running={running === drawer.id}
          onClose={() => setDrawer(null)}
        />
      )}
    </>
  )
}
