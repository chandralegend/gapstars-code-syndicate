"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { BoltIcon, ChevronLeftIcon } from "lucide-react"
import { toast } from "sonner"

import { CapLine } from "@/components/probe/cap-line"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useSetBreadcrumbs } from "@/lib/stores/breadcrumbs"
import { cn } from "@/lib/utils"

export default function NewTestPage() {
  useSetBreadcrumbs([
    { label: "Tests", href: "/tests" },
    { label: "New brief" },
  ])
  const router = useRouter()
  const [name, setName] = useState("Saved Carts — Cross-Device Persistence")
  const [sandbox, setSandbox] = useState<"e2b" | "cu">("e2b")

  return (
    <div className="mx-auto max-w-[820px] px-6 py-8">
      <div className="mb-3">
        <Button variant="ghost" size="sm" onClick={() => router.push("/tests")}>
          <ChevronLeftIcon className="size-[13px]" />
          Back to tests
        </Button>
      </div>

      <h1
        className="font-serif text-[34px] leading-tight tracking-[-0.015em]"
        style={{ fontFamily: "var(--font-serif), serif" }}
      >
        New test brief
      </h1>
      <p className="text-ink-3 mt-1 mb-5 text-[13.5px]">
        Write this like a PM brief — what&apos;s being tested, what&apos;s
        out of scope, success criteria. Agent 1 will turn it into a versioned
        FeatureExpectation.
      </p>

      <div className="border-border bg-card space-y-4 rounded-lg border p-6">
        <Field label="Title">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>

        <Field
          label="What's being tested"
          help="A few sentences of context — what the feature does and why it exists."
        >
          <Textarea
            rows={4}
            defaultValue="Authenticated shoppers can save their cart and resume it on any device. Anonymous carts merge non-destructively at sign-in. Stale carts (>30d) are pruned with a one-time recovery window."
          />
        </Field>

        <Field label="Explicitly out of scope">
          <Textarea
            rows={2}
            defaultValue="Checkout completion (covered by a separate test). Inventory reconciliation. Email notifications."
          />
        </Field>

        <Field label="Success criteria (free-form — Agent 1 will tighten)">
          <Textarea
            rows={4}
            defaultValue="Cart restores within 2s on a fresh device. Anon→auth merge is non-destructive. Carts older than 30d are unreachable except via the recovery flow. Save endpoint is idempotent within 24h."
          />
        </Field>

        <Field
          label="References (optional)"
          help="Repo paths, design docs, Figma URLs — anything the agents should read."
        >
          <Input defaultValue="github.com/example-org/shop/blob/main/api/v2/cart.py, web/src/CartPage.tsx" />
        </Field>

        <div className="pt-2">
          <CapLine className="mb-2">orchestration</CapLine>
        </div>

        <Field label="Sandbox mode">
          <div className="border-border bg-card inline-flex overflow-hidden rounded-md border">
            <button
              type="button"
              onClick={() => setSandbox("e2b")}
              className={cn(
                "px-3 py-1.5 text-[12.5px] font-medium",
                sandbox === "e2b"
                  ? "bg-foreground text-background"
                  : "text-ink-2 hover:bg-muted"
              )}
            >
              E2B · headless
            </button>
            <button
              type="button"
              onClick={() => setSandbox("cu")}
              className={cn(
                "border-border border-l px-3 py-1.5 text-[12.5px] font-medium",
                sandbox === "cu"
                  ? "bg-foreground text-background"
                  : "text-ink-2 hover:bg-muted"
              )}
            >
              Computer Use · noVNC
            </button>
          </div>
          <div className="text-ink-4 mt-2 text-[11.5px]">
            E2B is cheaper and faster. Switch to Computer Use only for
            pixel-level UI exploration.
          </div>
        </Field>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost">Save as draft</Button>
        <Button
          variant="accent"
          onClick={() => {
            toast.success("Run kicked off — opening timeline")
            setTimeout(() => router.push("/runs/run_018f2c"), 500)
          }}
        >
          <BoltIcon className="size-[13px]" />
          Kick off run
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
