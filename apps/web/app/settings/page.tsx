"use client"

import { LinkIcon } from "lucide-react"

import { CapLine } from "@/components/probe/cap-line"
import { PageHead } from "@/components/probe/page-head"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useSetBreadcrumbs } from "@/lib/stores/breadcrumbs"
import { cn } from "@/lib/utils"
import { useState } from "react"

const INTEGRATIONS = [
  { name: "Langfuse", desc: "Trace observability", connected: true },
  { name: "GitHub", desc: "Read repo references", connected: true },
  { name: "Slack", desc: "Run completion alerts", connected: false },
  { name: "Linear", desc: "File issues from failures", connected: false },
]

const MODELS = ["Claude Sonnet 4.5", "Claude Opus 4.5", "Haiku 4.5"]

export default function SettingsPage() {
  useSetBreadcrumbs([
    { label: "acme/shop", muted: true },
    { label: "Settings" },
  ])
  const [model, setModel] = useState(MODELS[0])

  return (
    <>
      <PageHead title="Settings" sub="acme/shop · project-level configuration" />
      <div className="max-w-[820px] space-y-4 px-6 py-6">
        <Card>
          <CapLine className="mb-4">budget</CapLine>
          <div className="space-y-4">
            <Field label="Default run budget cap" help="Individual tests can override this in their brief.">
              <Input defaultValue="$2.00" className="w-[140px]" />
            </Field>
            <Field label="Monthly project cap">
              <Input defaultValue="$200.00" className="w-[140px]" />
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

        <Card>
          <CapLine className="mb-4">integrations</CapLine>
          <div className="grid grid-cols-2 gap-2.5">
            {INTEGRATIONS.map((i) => (
              <div
                key={i.name}
                className="border-border bg-card flex items-center gap-2.5 rounded-md border p-3"
              >
                <div className="bg-muted text-ink-3 grid size-8 place-items-center rounded-md">
                  <LinkIcon className="size-[15px]" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium">{i.name}</div>
                  <div className="text-ink-3 text-[11.5px]">{i.desc}</div>
                </div>
                {i.connected ? (
                  <Badge variant="ok">connected</Badge>
                ) : (
                  <Button variant="ghost" size="sm">
                    Connect
                  </Button>
                )}
              </div>
            ))}
          </div>
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
