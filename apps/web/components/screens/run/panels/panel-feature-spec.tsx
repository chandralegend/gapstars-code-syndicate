"use client"

import { useState } from "react"
import {
  ActivityIcon,
  AlertTriangleIcon,
  CheckIcon,
  FileTextIcon,
  GitBranchIcon,
  GitCommitIcon,
  MoreHorizontalIcon,
  SendIcon,
  SparklesIcon,
} from "lucide-react"
import { toast } from "sonner"

import { PanelFrame, PanelHead } from "@/components/screens/run/panels/panel-frame"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { FEATURE_SPEC } from "@/lib/mock/feature-spec"
import { useRunView } from "@/lib/stores/run-view"

export function PanelFeatureSpec() {
  const gate1Approved = useRunView((s) => s.gate1Approved)
  const setGate1Approved = useRunView((s) => s.setGate1Approved)
  const [comment, setComment] = useState("")

  return (
    <PanelFrame>
      <PanelHead
        num="01"
        title="Feature understanding"
        desc="Versioned FeatureExpectation · v2 (edited)"
        right={
          <>
            <Badge variant="ok" className="gap-1.5">
              <span className="bg-ok size-1.5 rounded-full" />
              done · 21.4s
            </Badge>
            <Button variant="ghost" size="sm">
              <GitBranchIcon className="size-[13px]" />
              v1
            </Button>
            <Button variant="ghost" size="icon-sm">
              <MoreHorizontalIcon className="size-[13px]" />
            </Button>
          </>
        }
      />
      <Tabs defaultValue="spec" className="flex min-h-0 flex-1 flex-col">
        <TabsList className="border-border h-auto justify-start gap-1 rounded-none border-b bg-transparent px-6 py-0">
          <Tab value="spec" icon={<FileTextIcon className="size-[13px]" />}>
            Specification
          </Tab>
          <Tab value="diff" icon={<GitCommitIcon className="size-[13px]" />}>
            Diff vs. v1
            <span className="bg-muted text-ink-3 ml-1.5 rounded-[3px] px-1.5 py-px font-mono text-[10px]">
              +3 −1
            </span>
          </Tab>
          <Tab value="trace" icon={<ActivityIcon className="size-[13px]" />}>
            Trace
          </Tab>
        </TabsList>

        <TabsContent value="spec" className="min-h-0 flex-1 overflow-auto px-6 py-5">
          <SpecBody />
        </TabsContent>
        <TabsContent value="diff" className="min-h-0 flex-1 overflow-auto px-6 py-5">
          <DiffBody />
        </TabsContent>
        <TabsContent value="trace" className="min-h-0 flex-1 overflow-auto px-6 py-5">
          <TraceBody />
        </TabsContent>
      </Tabs>

      {!gate1Approved && (
        <div className="border-warn/40 bg-warn-soft/40 space-y-2 border-t px-6 py-3.5">
          <div className="text-warn-ink flex items-center gap-1.5 text-[12px] font-medium">
            <AlertTriangleIcon className="size-[12px]" />
            Human review required · run is paused on this node
          </div>
          <Textarea
            placeholder="Feedback for Agent 1 (e.g. 'tighten the acceptance criteria for tiered pricing — server should always honor the user's account tier, not the cheaper one')"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="min-h-[60px] resize-none text-[13px]"
          />
          <div className="flex items-center gap-2">
            <span className="text-ink-4 text-[11px]">
              ⌘↵ to accept · esc to discard edits
            </span>
            <div className="ml-auto flex gap-2">
              <Button variant="ghost" size="sm">
                Reject & rewrite
              </Button>
              <Button
                size="sm"
                disabled={!comment.trim()}
                onClick={() => {
                  toast.success("Feedback sent — Agent 1 will revise")
                  setComment("")
                }}
              >
                <SendIcon className="size-[13px]" />
                Send feedback
              </Button>
              <Button
                variant="accent"
                size="sm"
                onClick={() => {
                  setGate1Approved(true)
                  toast.success("Feature spec accepted — Agent 2 unblocked")
                }}
              >
                <CheckIcon className="size-[13px]" />
                Accept & continue
              </Button>
            </div>
          </div>
        </div>
      )}
    </PanelFrame>
  )
}

function Tab({
  value,
  icon,
  children,
}: {
  value: string
  icon?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <TabsTrigger
      value={value}
      className="text-ink-3 data-[state=active]:text-foreground data-[state=active]:border-foreground hover:text-foreground gap-1.5 rounded-none border-b-2 border-transparent bg-transparent px-3 py-2.5 text-[12.5px] data-[state=active]:bg-transparent data-[state=active]:shadow-none"
    >
      {icon}
      {children}
    </TabsTrigger>
  )
}

function SpecBody() {
  const spec = FEATURE_SPEC
  return (
    <div className="probe-slide-in max-w-[720px] space-y-5">
      <header>
        <h2
          className="font-serif text-[28px] leading-tight tracking-[-0.015em]"
          style={{ fontFamily: "var(--font-serif), serif" }}
        >
          {spec.title}
        </h2>
        <p className="text-ink-2 mt-2 text-[14.5px] leading-relaxed">{spec.lede}</p>
      </header>

      <Section title="What this feature does">
        <ul className="space-y-1.5 pl-5 text-[13.5px]">
          {spec.what.map((t, i) => (
            <li key={i} className="list-disc">
              {t}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="User flows">
        <ul className="space-y-1.5 pl-5 text-[13.5px]">
          {spec.flows.map((t, i) => (
            <li key={i} className="list-disc">
              {t}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Data contracts">
        <ul className="space-y-1.5 pl-5 text-[13px]">
          {spec.contracts.map((t, i) => (
            <li key={i} className="list-disc">
              <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-[12px]">
                {t}
              </code>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Acceptance criteria">
        <div className="space-y-2">
          {spec.acceptance.map((t, i) => (
            <div
              key={i}
              className="border-border bg-card flex items-start gap-3 rounded-md border p-3"
            >
              <span className="bg-foreground text-background mt-0.5 shrink-0 rounded-[4px] px-1.5 py-0.5 font-mono text-[10.5px] font-semibold">
                AC{i + 1}
              </span>
              <span className="text-[13px]">{t}</span>
            </div>
          ))}
        </div>
      </Section>

      <div className="text-ink-4 flex items-center gap-1.5 pt-3 font-mono text-[11px]">
        <SparklesIcon className="size-[11px]" />
        Generated from brief + 4 repo references · agent reasoned for 21.4 s
      </div>
    </div>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section>
      <h3 className="font-serif text-[18px] leading-tight tracking-[-0.005em]" style={{ fontFamily: "var(--font-serif), serif" }}>
        {title}
      </h3>
      <div className="mt-2">{children}</div>
    </section>
  )
}

function DiffBody() {
  return (
    <div className="border-border bg-card max-w-[760px] overflow-hidden rounded-md border font-mono text-[12.5px] leading-relaxed">
      {[
        { t: "### Acceptance criteria", k: "ctx" },
        { t: " ", k: "ctx" },
        { t: "- Carts older than 14 days are returned with a stale flag.", k: "del" },
        { t: "+ Carts older than 30 days are not returned by /cart/active; calling /cart/restore", k: "add" },
        { t: "+   within 7 days resurrects them.", k: "add" },
        { t: " ", k: "ctx" },
        { t: "- Idempotency: replays return the same cart_id within session.", k: "del" },
        { t: "+ Idempotency: replaying POST /cart/save with the same key within 24 h returns", k: "add" },
        { t: "+   the original cart_id.", k: "add" },
        { t: " ", k: "ctx" },
        { t: "+ Anon→auth merge preserves all SKUs from both carts; quantities are summed;", k: "add" },
        { t: "+   no duplicates.", k: "add" },
      ].map((l, i) => (
        <div
          key={i}
          className={
            l.k === "add"
              ? "bg-ok-soft/50 text-ok-ink px-3 py-px"
              : l.k === "del"
                ? "bg-err-soft/50 text-err-ink px-3 py-px"
                : "text-ink-3 px-3 py-px"
          }
        >
          {l.t}
        </div>
      ))}
    </div>
  )
}

function TraceBody() {
  const calls = [
    { t: "+0.0s", model: "Claude Sonnet 4.5", tokens: "1.2k → 0.4k", cost: "$0.004", purpose: "Plan structure of FeatureExpectation" },
    { t: "+2.1s", model: "Claude Sonnet 4.5", tokens: "6.4k → 1.8k", cost: "$0.029", purpose: "Extract data contracts from repo refs" },
    { t: "+8.3s", model: "Claude Sonnet 4.5", tokens: "5.1k → 1.1k", cost: "$0.022", purpose: "Draft user flows" },
    { t: "+14.6s", model: "Claude Sonnet 4.5", tokens: "5.7k → 1.4k", cost: "$0.027", purpose: "Synthesize acceptance criteria" },
  ]
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <div className="font-serif text-[20px]" style={{ fontFamily: "var(--font-serif), serif" }}>
          4 LLM calls
        </div>
        <Badge variant="muted">streamed via Langfuse</Badge>
      </div>
      <div className="border-border bg-card overflow-hidden rounded-md border">
        <table className="w-full text-[12.5px]">
          <thead className="text-ink-3 bg-muted/50 text-left text-[11px] tracking-wider uppercase">
            <tr>
              <th className="px-3 py-2">When</th>
              <th className="px-3 py-2">Purpose</th>
              <th className="px-3 py-2">Model</th>
              <th className="px-3 py-2">Tokens</th>
              <th className="px-3 py-2 text-right">Cost</th>
            </tr>
          </thead>
          <tbody>
            {calls.map((c, i) => (
              <tr key={i} className="border-border border-t">
                <td className="px-3 py-2 font-mono">{c.t}</td>
                <td className="px-3 py-2">{c.purpose}</td>
                <td className="px-3 py-2 font-mono">{c.model}</td>
                <td className="px-3 py-2 font-mono">{c.tokens}</td>
                <td className="px-3 py-2 text-right font-mono">{c.cost}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
