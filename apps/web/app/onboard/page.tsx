"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusIcon,
  SparklesIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useSetBreadcrumbs } from "@/lib/stores/breadcrumbs"
import { cn } from "@/lib/utils"

const STEPS = ["Context", "Personas", "Endpoints", "Rules", "Review"]

interface Persona {
  name: string
  role: string
  notes: string
}

export default function OnboardPage() {
  useSetBreadcrumbs([
    { label: "Projects", href: "/projects" },
    { label: "New project" },
  ])
  const router = useRouter()

  const [step, setStep] = useState(0)
  const [personas, setPersonas] = useState<Persona[]>([
    { name: "Authenticated shopper", role: "buyer", notes: "Has credentials; tier A pricing" },
    { name: "Anonymous shopper", role: "visitor", notes: "No account; localStorage cart" },
  ])
  const [rules, setRules] = useState(
    "• Always run against staging\n• Never POST to /api/checkout/* in tests\n• Use the seed user account for authenticated flows"
  )

  return (
    <div className="mx-auto max-w-[820px] px-6 py-8">
      {/* Stepper */}
      <div className="mb-7 flex items-center">
        {STEPS.map((s, i) => (
          <div key={i} className="flex flex-1 items-center last:flex-initial">
            <div
              className={cn(
                "flex items-center gap-2 text-[12.5px]",
                i === step && "text-foreground font-medium",
                i < step && "text-ok-ink",
                i > step && "text-ink-4"
              )}
            >
              <span
                className={cn(
                  "grid size-6 place-items-center rounded-full border text-[11px] font-semibold",
                  i === step && "border-foreground bg-foreground text-background",
                  i < step && "border-ok bg-ok text-white",
                  i > step && "border-border text-ink-4"
                )}
              >
                {i < step ? <CheckIcon className="size-[12px]" /> : i + 1}
              </span>
              {s}
            </div>
            {i < STEPS.length - 1 && (
              <div className={cn("mx-3 h-px flex-1", i < step ? "bg-ok" : "bg-border")} />
            )}
          </div>
        ))}
      </div>

      <div className="border-border bg-card rounded-lg border p-6">
        <h2
          className="font-serif text-[26px] leading-tight tracking-[-0.012em]"
          style={{ fontFamily: "var(--font-serif), serif" }}
        >
          {step === 0 && "Tell us about your product"}
          {step === 1 && "Who uses it?"}
          {step === 2 && "Where does it live?"}
          {step === 3 && "House rules for the agents"}
          {step === 4 && "Ready to roll"}
        </h2>
        <p className="text-ink-3 mt-1 mb-5 text-[13px]">
          {step === 0 && "Probe uses this context across every test in this project. You can edit it later."}
          {step === 1 && "Add up to 6 personas. Agents adopt these roles when exploring."}
          {step === 2 && "URLs the agents are allowed to hit."}
          {step === 3 && "Free-form constraints. The agents see these in their system prompt."}
          {step === 4 && "Everything below will be the project's starting context. Ship it."}
        </p>

        {step === 0 && (
          <div className="space-y-4">
            <Field label="Project name">
              <Input defaultValue="Probe" />
            </Field>
            <Field label="One-line description">
              <Input defaultValue="A direct-to-consumer marketplace for outdoor gear. Web + iOS." />
            </Field>
            <Field
              label="What does Probe need to know to test this product well?"
              help="Stack, architectural quirks, anything an outside QA contractor would ask in week 1."
            >
              <Textarea
                rows={5}
                defaultValue="Next.js storefront, Python (FastAPI) API, Postgres. Cart is server-authoritative for authenticated users; anonymous carts are localStorage. Apple Pay and Stripe are the two payment methods. Inventory updates every 60 s via a background job."
              />
            </Field>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-3">
            <div className="text-ink-3 text-[12px]">
              Agents will roleplay these when probing flows.
            </div>
            {personas.map((p, i) => (
              <div key={i} className="grid grid-cols-[1fr_120px_1fr_auto] items-center gap-2">
                <Input
                  value={p.name}
                  onChange={(e) => {
                    const next = [...personas]
                    next[i] = { ...next[i], name: e.target.value }
                    setPersonas(next)
                  }}
                />
                <Input
                  value={p.role}
                  onChange={(e) => {
                    const next = [...personas]
                    next[i] = { ...next[i], role: e.target.value }
                    setPersonas(next)
                  }}
                />
                <Input
                  value={p.notes}
                  onChange={(e) => {
                    const next = [...personas]
                    next[i] = { ...next[i], notes: e.target.value }
                    setPersonas(next)
                  }}
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setPersonas(personas.filter((_, j) => j !== i))}
                  aria-label="Remove persona"
                >
                  <Trash2Icon className="size-[13px]" />
                </Button>
              </div>
            ))}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPersonas([...personas, { name: "", role: "", notes: "" }])}
            >
              <PlusIcon className="size-[13px]" />
              Add persona
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <Field label="Staging base URL">
              <Input defaultValue="https://staging.example.com" />
            </Field>
            <Field label="API base URL">
              <Input defaultValue="https://api.staging.example.com" />
            </Field>
            <Field label="Repo (optional, for reference reading)">
              <Input defaultValue="github.com/example-org/example" />
            </Field>
          </div>
        )}

        {step === 3 && (
          <Field
            label="Rules & constraints"
            help="Markdown. Each line becomes a rule the agents must respect."
          >
            <Textarea rows={9} value={rules} onChange={(e) => setRules(e.target.value)} />
          </Field>
        )}

        {step === 4 && (
          <div className="bg-muted border-border rounded-md border p-5">
            <div className="mb-3 flex items-center gap-2">
              <SparklesIcon className="text-accent size-[16px]" />
              <strong>Probe will index your project</strong>
              <span className="text-ink-4 ml-auto font-mono text-[11.5px]">
                est. 18s
              </span>
            </div>
            <ul className="text-ink-2 list-disc space-y-1 pl-5 text-[13.5px] leading-relaxed">
              <li>
                Crawl OpenAPI at{" "}
                <code className="bg-card rounded px-1.5 py-0.5 font-mono text-[12px]">
                  /api/openapi.json
                </code>
              </li>
              <li>Read repo references for shared vocabulary</li>
              <li>Provision a workspace image with playwright + httpx</li>
              <li>Set up SSE channel for the run timeline</li>
            </ul>
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
          {step < STEPS.length - 1 && (
            <Button variant="ghost" onClick={() => toast.success("Saved draft")}>
              Save draft
            </Button>
          )}
          {step < STEPS.length - 1 ? (
            <Button onClick={() => setStep(step + 1)}>
              Continue
              <ChevronRightIcon className="size-[13px]" />
            </Button>
          ) : (
            <Button
              variant="accent"
              onClick={() => {
                toast.success("Project created — opening project home")
                // Demo: route into the seeded project's overview.
                setTimeout(() => router.push("/projects/shop"), 400)
              }}
            >
              <CheckIcon className="size-[13px]" />
              Create project
            </Button>
          )}
        </div>
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
