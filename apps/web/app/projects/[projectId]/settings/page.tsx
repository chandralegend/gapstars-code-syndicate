"use client"

import { use, useState } from "react"
import { notFound } from "next/navigation"

import { CapLine } from "@/components/probe/cap-line"
import { PageHead } from "@/components/probe/page-head"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { getProject } from "@/lib/mock/projects"
import { useSetBreadcrumbs } from "@/lib/stores/breadcrumbs"
import { cn } from "@/lib/utils"

const MODELS = ["Claude Sonnet 4.5", "Claude Opus 4.5", "Haiku 4.5"]

export default function ProjectSettingsPage({
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
          { label: "Settings" },
        ]
      : [{ label: "Projects", href: "/projects" }],
  )

  const [model, setModel] = useState(MODELS[0])

  if (!project) notFound()

  return (
    <>
      <PageHead title="Settings" sub={`Project · ${project.name}`} />
      <div className="max-w-[820px] space-y-4 px-6 py-6">
        <Card>
          <CapLine className="mb-4">project</CapLine>
          <div className="space-y-4">
            <Field label="Project name">
              <Input defaultValue={project.name} />
            </Field>
            <Field label="Description">
              <Textarea rows={3} defaultValue={project.description} />
            </Field>
            <Field label="Staging base URL">
              <Input defaultValue={`https://${project.stagingUrl}`} />
            </Field>
          </div>
        </Card>

        <Card>
          <CapLine className="mb-4">models</CapLine>
          <Field label="Default LLM">
            <div className="border-border inline-flex overflow-hidden rounded-md border">
              {MODELS.map((m, i) => (
                <button
                  type="button"
                  key={m}
                  onClick={() => setModel(m)}
                  className={cn(
                    "px-3 py-1.5 text-[12.5px] font-medium",
                    i > 0 && "border-border border-l",
                    m === model
                      ? "bg-foreground text-background"
                      : "text-ink-2 hover:bg-muted"
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
          </Field>
        </Card>
      </div>
    </>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-border bg-card rounded-lg border p-5">
      {children}
    </div>
  )
}

function Field({
  label,
  help,
  children,
}: {
  label: string
  help?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <Label className="mb-1.5 block text-[12.5px] font-medium">{label}</Label>
      {help && <div className="text-ink-3 mb-2 text-[12px]">{help}</div>}
      {children}
    </div>
  )
}
