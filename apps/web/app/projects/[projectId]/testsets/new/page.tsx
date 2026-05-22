"use client"

import { use, useCallback, useState } from "react"
import { useRouter } from "next/navigation"
import { BoltIcon, ChevronLeftIcon } from "lucide-react"
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

const FEATURE_DESCRIPTION_PLACEHOLDER = `Describe the feature, the surfaces it affects, and any in- or out-of-scope notes.

Example: "Authenticated shoppers can save a cart and resume it on any device. Out of scope: anonymous carts older than 30 days."`

const USER_STORY_PLACEHOLDER = `As a … I want … so that …

Example: "As a returning shopper I want my cart to follow me across devices so I don't lose items I picked out earlier."`

const ACCEPTANCE_CRITERIA_PLACEHOLDER = `One bullet per criterion.

Example:
- The endpoint returns 200 and content-type application/json.
- The response body is exactly {"status":"ok"}.
- Latency is under 1 second under normal load.`

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
    if (!title.trim()) {
      toast.error("Title is required")
      return
    }
    if (!featureDescription.trim()) {
      toast.error("Feature description is required")
      return
    }
    if (!userStory.trim()) {
      toast.error("User story is required")
      return
    }
    if (!acceptanceCriteria.trim()) {
      toast.error("Acceptance criteria are required")
      return
    }
    try {
      const scenario = await createMut.run()
      toast.success("Feature test created")
      router.push(`/projects/${projectId}/testsets/${scenario.id}`)
    } catch (e) {
      toast.error(`Failed to create: ${e instanceof Error ? e.message : e}`)
    }
  }

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

      <h1
        className="font-serif text-[34px] leading-tight tracking-[-0.015em]"
        style={{ fontFamily: "var(--font-serif), serif" }}
      >
        New feature test
      </h1>
      <p className="text-ink-3 mt-1 mb-5 text-[13.5px]">
        Write this like a PM brief — what&apos;s being tested, the user
        story, and what needs to be true to pass. The orchestrator will turn
        it into a versioned brief and explore the feature in a sandbox.
      </p>

      <div className="border-border bg-card space-y-4 rounded-lg border p-6">
        <Field label="Title">
          <Input
            value={title}
            placeholder="e.g. Saved Carts — Cross-Device Persistence"
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>

        <Field
          label="Feature description"
          help="A few sentences of context — what the feature does and why it exists."
        >
          <Textarea
            rows={5}
            value={featureDescription}
            onChange={(e) => setFeatureDescription(e.target.value)}
            placeholder={FEATURE_DESCRIPTION_PLACEHOLDER}
          />
        </Field>

        <Field label="User story">
          <Textarea
            rows={4}
            value={userStory}
            onChange={(e) => setUserStory(e.target.value)}
            placeholder={USER_STORY_PLACEHOLDER}
          />
        </Field>

        <Field
          label="What needs to be true to pass"
          help="One concrete, observable criterion per bullet."
        >
          <Textarea
            rows={7}
            value={acceptanceCriteria}
            onChange={(e) => setAcceptanceCriteria(e.target.value)}
            placeholder={ACCEPTANCE_CRITERIA_PLACEHOLDER}
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
          <BoltIcon className="size-[13px]" />
          {createMut.loading ? "Creating…" : "Create feature test"}
        </Button>
      </div>
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
