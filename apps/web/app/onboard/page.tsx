"use client"

import { useCallback, useState } from "react"
import { useRouter } from "next/navigation"
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  SparklesIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PageContainer } from "@/components/shell/page-container"
import { Textarea } from "@/components/ui/textarea"
import { createProject, useMutation } from "@/lib/api"
import { useSetBreadcrumbs } from "@/lib/stores/breadcrumbs"
import { cn } from "@/lib/utils"

const STEPS = ["Project", "Problem", "Context", "Anything else?", "Review"]

export default function OnboardPage() {
  useSetBreadcrumbs([
    { label: "Projects", href: "/projects" },
    { label: "New project" },
  ])
  const router = useRouter()

  const [step, setStep] = useState(0)
  const [form, setForm] = useState({
    name: "",
    description: "",
    problem_statement: "",
    target_users: "",
    tech_stack: "",
    additional_context: "",
  })

  const createMut = useMutation(
    useCallback(
      () =>
        createProject({
          name: form.name,
          description: form.description,
          problem_statement: form.problem_statement,
          target_users: form.target_users || null,
          tech_stack: form.tech_stack || null,
          additional_context: form.additional_context || null,
        }),
      [form],
    ),
  )

  const isStepValid = () => {
    if (step === 0) return form.name.trim() && form.description.trim()
    if (step === 1) return form.problem_statement.trim()
    return true
  }

  const submit = async () => {
    if (!form.name.trim() || !form.description.trim()) {
      toast.error("Add a project name and description before continuing.")
      setStep(0)
      return
    }
    if (!form.problem_statement.trim()) {
      toast.error("A problem statement is required.")
      setStep(1)
      return
    }
    try {
      const project = await createMut.run()
      toast.success("Project created")
      router.push(`/projects/${project.id}`)
    } catch (e) {
      toast.error(
        `Could not create project: ${e instanceof Error ? e.message : e}`,
      )
    }
  }

  return (
    <PageContainer size="narrow" className="py-8">
      <ol
        role="list"
        aria-label="Setup steps"
        className="mb-8 flex items-center"
      >
        {STEPS.map((s, i) => (
          <li key={i} className="flex flex-1 items-center last:flex-initial">
            <div
              aria-current={i === step ? "step" : undefined}
              className={cn(
                "flex items-center gap-2 text-sm",
                i === step && "text-foreground font-medium",
                i < step && "text-ok-ink",
                i > step && "text-ink-3",
              )}
            >
              <span
                className={cn(
                  "grid size-6 place-items-center rounded-full border text-xs font-semibold",
                  i === step && "border-foreground bg-foreground text-background",
                  i < step && "border-ok-ink bg-ok-ink text-white",
                  i > step && "border-border text-ink-3",
                )}
              >
                {i < step ? <CheckIcon aria-hidden className="size-[12px]" /> : i + 1}
                <span className="sr-only">{i < step ? "Completed: " : i === step ? "Current: " : "Upcoming: "}{s}</span>
              </span>
              <span aria-hidden>{s}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                aria-hidden
                className={cn(
                  "mx-3 h-px flex-1",
                  i < step ? "bg-ok-ink/50" : "bg-border",
                )}
              />
            )}
          </li>
        ))}
      </ol>

      <div className="border-border bg-card rounded-lg border p-6">
        <h2 className="text-[24px] leading-tight font-semibold tracking-[-0.02em]">
          {step === 0 && "Tell us about the project"}
          {step === 1 && "What problem does it solve?"}
          {step === 2 && "Who uses it and how is it built?"}
          {step === 3 && "Anything else worth knowing?"}
          {step === 4 && "Ready to create the project"}
        </h2>
        <p className="text-ink-3 mt-1 mb-5 text-[13px]">
          {step === 0 && "Name and a one-line description. Both required."}
          {step === 1 &&
            "A short problem statement helps Agent 1 frame each test set. Required."}
          {step === 2 &&
            "Optional context about the audience and the tech stack."}
          {step === 3 &&
            "Anything an outside QA contractor would ask in week one."}
          {step === 4 &&
            "Review the inputs below and create the project. You can edit later."}
        </p>

        {step === 0 && (
          <div className="space-y-4">
            <Field label="Project name">
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Acme Shop"
              />
            </Field>
            <Field label="One-line description">
              <Input
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                placeholder="A direct-to-consumer marketplace for outdoor gear."
              />
            </Field>
          </div>
        )}

        {step === 1 && (
          <Field label="Problem statement">
            <Textarea
              rows={6}
              value={form.problem_statement}
              onChange={(e) =>
                setForm({ ...form, problem_statement: e.target.value })
              }
              placeholder="What problem does this product solve, and why does that matter for QA?"
            />
          </Field>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <Field label="Target users (optional)">
              <Textarea
                rows={3}
                value={form.target_users}
                onChange={(e) =>
                  setForm({ ...form, target_users: e.target.value })
                }
                placeholder="Internal QA engineers; mobile-first shoppers; SREs running test suites."
              />
            </Field>
            <Field label="Tech stack (optional)">
              <Input
                value={form.tech_stack}
                onChange={(e) =>
                  setForm({ ...form, tech_stack: e.target.value })
                }
                placeholder="Next.js, FastAPI, Postgres, Redis, Anthropic Claude."
              />
            </Field>
          </div>
        )}

        {step === 3 && (
          <Field label="Additional context (optional)">
            <Textarea
              rows={6}
              value={form.additional_context}
              onChange={(e) =>
                setForm({ ...form, additional_context: e.target.value })
              }
              placeholder="Quirks of the system, staging URLs, things to avoid touching, etc."
            />
          </Field>
        )}

        {step === 4 && (
          <div className="bg-muted border-border rounded-md border p-5">
            <div className="mb-3 flex items-center gap-2">
              <SparklesIcon className="text-accent size-[16px]" />
              <strong>Project preview</strong>
            </div>
            <dl className="space-y-2 text-[13px]">
              <Row label="Name">{form.name || <em>missing</em>}</Row>
              <Row label="Description">
                {form.description || <em>missing</em>}
              </Row>
              <Row label="Problem">
                {form.problem_statement || <em>missing</em>}
              </Row>
              {form.target_users && (
                <Row label="Target users">{form.target_users}</Row>
              )}
              {form.tech_stack && (
                <Row label="Tech stack">{form.tech_stack}</Row>
              )}
              {form.additional_context && (
                <Row label="Additional">{form.additional_context}</Row>
              )}
            </dl>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center gap-2">
        {step > 0 && (
          <Button variant="ghost" onClick={() => setStep(step - 1)}>
            <ChevronLeftIcon className="size-[13px]" />
            Back
          </Button>
        )}
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" onClick={() => router.push("/projects")}>
            Cancel
          </Button>
          {step < STEPS.length - 1 ? (
            <Button
              onClick={() => setStep(step + 1)}
              disabled={!isStepValid()}
            >
              Continue
              <ChevronRightIcon className="size-[13px]" />
            </Button>
          ) : (
            <Button
              variant="accent"
              onClick={submit}
              disabled={createMut.loading}
            >
              <CheckIcon className="size-[13px]" />
              {createMut.loading ? "Creating…" : "Create project"}
            </Button>
          )}
        </div>
      </div>
    </PageContainer>
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

function Row({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3 text-[13px]">
      <dt className="text-ink-3">{label}</dt>
      <dd className="text-ink-2 whitespace-pre-wrap">{children}</dd>
    </div>
  )
}
