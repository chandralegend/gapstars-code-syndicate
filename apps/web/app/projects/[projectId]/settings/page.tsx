"use client"

import { use, useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import { CapLine } from "@/components/probe/cap-line"
import { PageHead } from "@/components/probe/page-head"
import { PageContainer } from "@/components/shell/page-container"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  getProject,
  updateProject,
  useFetch,
  useMutation,
} from "@/lib/api"
import { useSetBreadcrumbs } from "@/lib/stores/breadcrumbs"

export default function ProjectSettingsPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = use(params)
  const projectQ = useFetch(
    useCallback(() => getProject(projectId), [projectId]),
    [projectId],
  )

  useSetBreadcrumbs(
    projectQ.data
      ? [
          { label: "Projects", href: "/projects" },
          {
            label: projectQ.data.name,
            href: `/projects/${projectQ.data.id}`,
          },
          { label: "Settings" },
        ]
      : [{ label: "Projects", href: "/projects" }],
  )

  const project = projectQ.data

  const [form, setForm] = useState({
    name: "",
    description: "",
    problem_statement: "",
    target_users: "",
    tech_stack: "",
    additional_context: "",
  })

  useEffect(() => {
    if (project) {
      setForm({
        name: project.name,
        description: project.description,
        problem_statement: project.problem_statement,
        target_users: project.target_users ?? "",
        tech_stack: project.tech_stack ?? "",
        additional_context: project.additional_context ?? "",
      })
    }
  }, [project])

  const saveMut = useMutation(
    useCallback(
      async () =>
        updateProject(projectId, {
          name: form.name,
          description: form.description,
          problem_statement: form.problem_statement,
          target_users: form.target_users || null,
          tech_stack: form.tech_stack || null,
          additional_context: form.additional_context || null,
        }),
      [projectId, form],
    ),
  )

  const save = async () => {
    try {
      const updated = await saveMut.run()
      toast.success("Project updated")
      projectQ.setData(updated)
    } catch (e) {
      toast.error(`Failed to save: ${e instanceof Error ? e.message : e}`)
    }
  }

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
    <PageContainer size="narrow">
      <PageHead title="Settings" sub={project.name} />
      <div className="space-y-4 py-6">
        <Card>
          <CapLine className="mb-4">project</CapLine>
          <div className="space-y-4">
            <Field label="Name">
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Field label="Description">
              <Textarea
                rows={2}
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
              />
            </Field>
            <Field label="Problem statement">
              <Textarea
                rows={3}
                value={form.problem_statement}
                onChange={(e) =>
                  setForm({ ...form, problem_statement: e.target.value })
                }
              />
            </Field>
            <Field label="Target users">
              <Input
                value={form.target_users}
                onChange={(e) =>
                  setForm({ ...form, target_users: e.target.value })
                }
              />
            </Field>
            <Field label="Tech stack">
              <Input
                value={form.tech_stack}
                onChange={(e) =>
                  setForm({ ...form, tech_stack: e.target.value })
                }
              />
            </Field>
            <Field label="Additional context">
              <Textarea
                rows={3}
                value={form.additional_context}
                onChange={(e) =>
                  setForm({ ...form, additional_context: e.target.value })
                }
              />
            </Field>
          </div>
        </Card>

        <div className="flex justify-end gap-2">
          <Button variant="accent" onClick={save} disabled={saveMut.loading}>
            {saveMut.loading ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>
    </PageContainer>
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
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <Label className="mb-1.5 block text-[12.5px] font-medium">{label}</Label>
      {children}
    </div>
  )
}
