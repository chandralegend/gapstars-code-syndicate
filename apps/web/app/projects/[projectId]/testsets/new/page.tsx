"use client"

import { use, useCallback, useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronLeftIcon, PlusIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  createTestScenario,
  getProject,
  useFetch,
  useMutation,
} from "@/lib/api"
import { useSetBreadcrumbs } from "@/lib/stores/breadcrumbs"
import { cn } from "@/lib/utils"

const FEATURE_DESCRIPTION_PLACEHOLDER = `Describe the feature, the surfaces it affects, and any in or out of scope notes.

Example: "Authenticated shoppers can save a cart and resume it on any device. Out of scope: anonymous carts older than 30 days."`

const USER_STORY_PLACEHOLDER = `As a … I want … so that …

Example: "As a returning shopper I want my cart to follow me across devices so I don't lose items I picked out earlier."`

const ACCEPTANCE_CRITERIA_PLACEHOLDER = `One bullet per criterion.

Example:
- The endpoint returns 200 and content-type application/json.
- The response body is exactly {"status":"ok"}.
- Latency is under 1 second under normal load.`

type FieldId = "title" | "featureDescription" | "userStory" | "acceptanceCriteria"
type Errors = Partial<Record<FieldId, string>>

export default function NewTestsetPage({
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

  useSetBreadcrumbs(
    projectQ.data
      ? [
          { label: "Projects", href: "/projects" },
          {
            label: projectQ.data.name,
            href: `/projects/${projectQ.data.id}`,
          },
          { label: "Feature tests", href: `/projects/${projectQ.data.id}/testsets` },
          { label: "New feature test" },
        ]
      : [{ label: "Projects", href: "/projects" }],
  )

  const [title, setTitle] = useState("")
  const [featureDescription, setFeatureDescription] = useState("")
  const [userStory, setUserStory] = useState("")
  const [acceptanceCriteria, setAcceptanceCriteria] = useState("")
  const [touched, setTouched] = useState<Record<FieldId, boolean>>({
    title: false,
    featureDescription: false,
    userStory: false,
    acceptanceCriteria: false,
  })
  const [submitted, setSubmitted] = useState(false)

  const errors: Errors = {}
  if (!title.trim()) errors.title = "Give the feature test a short title."
  if (!featureDescription.trim())
    errors.featureDescription = "Describe what's being tested in a few sentences."
  if (!userStory.trim()) errors.userStory = "Add the user story."
  if (!acceptanceCriteria.trim())
    errors.acceptanceCriteria =
      "List at least one criterion that decides pass or fail."

  const showError = (id: FieldId): boolean =>
    Boolean(errors[id]) && (touched[id] || submitted)

  const createMut = useMutation(
    useCallback(async () => {
      const scenario = await createTestScenario(projectId, {
        title,
        feature_description: featureDescription,
        user_story: userStory,
        acceptance_criteria: acceptanceCriteria,
      })
      return scenario
    }, [projectId, title, featureDescription, userStory, acceptanceCriteria]),
  )

  const project = projectQ.data
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

  const submit = async () => {
    setSubmitted(true)
    if (Object.keys(errors).length > 0) {
      // Focus the first invalid field.
      const order: FieldId[] = [
        "title",
        "featureDescription",
        "userStory",
        "acceptanceCriteria",
      ]
      const first = order.find((id) => errors[id])
      if (first) {
        const el = document.getElementById(`field-${first}`)
        el?.focus()
      }
      return
    }
    try {
      const scenario = await createMut.run()
      toast.success("Feature test created")
      router.push(`/projects/${projectId}/testsets/${scenario.id}`)
    } catch (e) {
      toast.error(`Could not create: ${e instanceof Error ? e.message : e}`)
    }
  }

  const summaryVisible = submitted && Object.keys(errors).length > 0

  return (
    <div className="mx-auto max-w-[820px] px-6 py-8">
      <div className="mb-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(`/projects/${project.id}/testsets`)}
        >
          <ChevronLeftIcon className="size-[13px]" />
          Back to feature tests
        </Button>
      </div>

      <h1 className="font-serif text-[34px] leading-tight tracking-[-0.015em]">
        New feature test
      </h1>
      <p className="text-ink-3 mt-1 mb-5 text-[13.5px]">
        Write this like a short product brief: what&apos;s being tested, the
        user story, and what needs to be true to pass. The orchestrator will
        turn it into a versioned brief and explore the feature in a sandbox.
      </p>

      {summaryVisible && (
        <div
          role="alert"
          className="border-err/40 bg-err-soft text-err-ink mb-4 rounded-md border p-3 text-[13px]"
        >
          {Object.keys(errors).length === 1
            ? "One field needs attention before you can continue."
            : `${Object.keys(errors).length} fields need attention before you can continue.`}
        </div>
      )}

      <div className="border-border bg-card space-y-4 rounded-lg border p-6">
        <Field
          id="title"
          label="Title"
          error={showError("title") ? errors.title : undefined}
        >
          <Input
            id="field-title"
            value={title}
            placeholder="e.g. Saved Carts: Cross-Device Persistence"
            aria-invalid={showError("title") || undefined}
            aria-describedby={
              showError("title") ? "field-title-error" : undefined
            }
            onBlur={() => setTouched((t) => ({ ...t, title: true }))}
            onChange={(e) => setTitle(e.target.value)}
            className={cn(showError("title") && "border-err/60 focus-visible:ring-err/30")}
          />
        </Field>

        <Field
          id="featureDescription"
          label="Feature description"
          help="A few sentences of context: what the feature does and why it exists."
          error={
            showError("featureDescription") ? errors.featureDescription : undefined
          }
        >
          <Textarea
            id="field-featureDescription"
            rows={5}
            value={featureDescription}
            aria-invalid={showError("featureDescription") || undefined}
            aria-describedby={
              showError("featureDescription")
                ? "field-featureDescription-error"
                : undefined
            }
            onBlur={() =>
              setTouched((t) => ({ ...t, featureDescription: true }))
            }
            onChange={(e) => setFeatureDescription(e.target.value)}
            placeholder={FEATURE_DESCRIPTION_PLACEHOLDER}
            className={cn(
              showError("featureDescription") &&
                "border-err/60 focus-visible:ring-err/30",
            )}
          />
        </Field>

        <Field
          id="userStory"
          label="User story"
          error={showError("userStory") ? errors.userStory : undefined}
        >
          <Textarea
            id="field-userStory"
            rows={4}
            value={userStory}
            aria-invalid={showError("userStory") || undefined}
            aria-describedby={
              showError("userStory") ? "field-userStory-error" : undefined
            }
            onBlur={() => setTouched((t) => ({ ...t, userStory: true }))}
            onChange={(e) => setUserStory(e.target.value)}
            placeholder={USER_STORY_PLACEHOLDER}
            className={cn(
              showError("userStory") && "border-err/60 focus-visible:ring-err/30",
            )}
          />
        </Field>

        <Field
          id="acceptanceCriteria"
          label="What needs to be true to pass"
          help="One concrete, observable criterion per bullet."
          error={
            showError("acceptanceCriteria") ? errors.acceptanceCriteria : undefined
          }
        >
          <Textarea
            id="field-acceptanceCriteria"
            rows={7}
            value={acceptanceCriteria}
            aria-invalid={showError("acceptanceCriteria") || undefined}
            aria-describedby={
              showError("acceptanceCriteria")
                ? "field-acceptanceCriteria-error"
                : undefined
            }
            onBlur={() =>
              setTouched((t) => ({ ...t, acceptanceCriteria: true }))
            }
            onChange={(e) => setAcceptanceCriteria(e.target.value)}
            placeholder={ACCEPTANCE_CRITERIA_PLACEHOLDER}
            className={cn(
              showError("acceptanceCriteria") &&
                "border-err/60 focus-visible:ring-err/30",
            )}
          />
        </Field>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <Button
          variant="ghost"
          onClick={() => router.push(`/projects/${project.id}/testsets`)}
        >
          Cancel
        </Button>
        <Button variant="accent" onClick={submit} disabled={createMut.loading}>
          <PlusIcon className="size-[13px]" />
          {createMut.loading ? "Creating…" : "Create feature test"}
        </Button>
      </div>
    </div>
  )
}

function Field({
  id,
  label,
  help,
  error,
  children,
}: {
  id: FieldId
  label: string
  help?: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <Label
        htmlFor={`field-${id}`}
        className="mb-1.5 block text-[12.5px] font-medium"
      >
        {label}
      </Label>
      {help && <div className="text-ink-3 mb-2 text-[12px]">{help}</div>}
      {children}
      {error && (
        <div
          id={`field-${id}-error`}
          role="alert"
          className="text-err-ink mt-1.5 text-[12px]"
        >
          {error}
        </div>
      )}
    </div>
  )
}
