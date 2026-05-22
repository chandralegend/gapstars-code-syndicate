"use client"

import { PageHead } from "@/components/probe/page-head"
import { CapLine } from "@/components/probe/cap-line"
import { Label } from "@/components/ui/label"
import { useSetBreadcrumbs } from "@/lib/stores/breadcrumbs"
import { cn } from "@/lib/utils"
import { useState } from "react"

const MODELS = ["Claude Sonnet 4.5", "Claude Opus 4.5", "Haiku 4.5"]

export default function SettingsPage() {
  useSetBreadcrumbs([{ label: "Settings" }])
  const [model, setModel] = useState(MODELS[0])

  return (
    <>
      <PageHead title="Settings" sub="Project-level configuration" />
      <div className="max-w-[820px] space-y-4 px-6 py-6">
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
    <div className="border-border bg-card rounded-lg border p-5">{children}</div>
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
