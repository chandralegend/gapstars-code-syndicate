"use client"

import { useState } from "react"
import {
  AlertTriangleIcon,
  BoltIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CopyIcon,
  EditIcon,
  PlusIcon,
  XIcon,
  ZapIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Tag } from "@/components/probe/tag"
import {
  PanelBody,
  PanelFrame,
  PanelHead,
} from "@/components/screens/run/panels/panel-frame"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TEST_CASES } from "@/lib/mock/test-cases"
import { useRunView } from "@/lib/stores/run-view"
import type { TestCase, TestCaseKind } from "@/lib/types"
import { cn } from "@/lib/utils"

const KIND_META: Record<
  TestCaseKind,
  { label: string; sub: string; variant: "ok" | "warn" | "info" }
> = {
  happy: { label: "Happy path", sub: "core flows that must work", variant: "ok" },
  edge: { label: "Edge", sub: "near-spec failure modes", variant: "warn" },
  corner: { label: "Corner", sub: "exotic / adversarial conditions", variant: "info" },
}

export function PanelTestCases() {
  const accepted = useRunView((s) => s.accepted)
  const rejected = useRunView((s) => s.rejected)
  const toggleAccept = useRunView((s) => s.toggleAccept)
  const toggleReject = useRunView((s) => s.toggleReject)
  const acceptAll = useRunView((s) => s.acceptAll)

  const [tab, setTab] = useState<"all" | TestCaseKind>("all")
  const [expanded, setExpanded] = useState<string | null>(null)

  const counts = {
    happy: TEST_CASES.filter((t) => t.kind === "happy").length,
    edge: TEST_CASES.filter((t) => t.kind === "edge").length,
    corner: TEST_CASES.filter((t) => t.kind === "corner").length,
  }
  const visible = tab === "all" ? TEST_CASES : TEST_CASES.filter((t) => t.kind === tab)
  const acceptedCount = Object.values(accepted).filter(Boolean).length
  const rejectedCount = Object.values(rejected).filter(Boolean).length

  return (
    <PanelFrame>
      <PanelHead
        num="03"
        title="Test cases for review"
        desc={`${TEST_CASES.length} cases · ${counts.happy} happy · ${counts.edge} edge · ${counts.corner} corner`}
        right={
          <>
            <Badge variant="ok">{acceptedCount} accepted</Badge>
            {rejectedCount > 0 && <Badge variant="err">{rejectedCount} rejected</Badge>}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                acceptAll(TEST_CASES.map((t) => t.id))
                toast.success(`Accepted all ${TEST_CASES.length} cases`)
              }}
            >
              <CheckIcon className="size-[13px]" />
              Accept all
            </Button>
            <Button variant="ghost" size="sm">
              <PlusIcon className="size-[13px]" />
              Add case
            </Button>
          </>
        }
      />
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="flex min-h-0 flex-1 flex-col">
        <TabsList className="border-border h-auto justify-start gap-1 rounded-none border-b bg-transparent px-6 py-0">
          <Tab value="all">
            All
            <span className="bg-muted text-ink-3 ml-1.5 rounded-[3px] px-1.5 py-px font-mono text-[10px]">
              {TEST_CASES.length}
            </span>
          </Tab>
          <Tab value="happy">
            Happy path
            <span className="bg-muted text-ink-3 ml-1.5 rounded-[3px] px-1.5 py-px font-mono text-[10px]">
              {counts.happy}
            </span>
          </Tab>
          <Tab value="edge">
            Edge
            <span className="bg-muted text-ink-3 ml-1.5 rounded-[3px] px-1.5 py-px font-mono text-[10px]">
              {counts.edge}
            </span>
          </Tab>
          <Tab value="corner">
            Corner
            <span className="bg-muted text-ink-3 ml-1.5 rounded-[3px] px-1.5 py-px font-mono text-[10px]">
              {counts.corner}
            </span>
          </Tab>
        </TabsList>

        <PanelBody>
          {(["happy", "edge", "corner"] as const).map((kind) => {
            const items = visible.filter((t) => t.kind === kind)
            if (items.length === 0) return null
            const meta = KIND_META[kind]
            return (
              <section key={kind} className="mb-7 last:mb-0">
                <div className="mb-3 flex items-center gap-2">
                  <h3 className="font-serif text-[18px]" style={{ fontFamily: "var(--font-serif), serif" }}>
                    {meta.label}
                  </h3>
                  <Badge variant={meta.variant}>{items.length}</Badge>
                  <span className="text-ink-3 text-[12px]">{meta.sub}</span>
                </div>
                <div className="space-y-2">
                  {items.map((t) => (
                    <TestCaseRow
                      key={t.id}
                      tc={t}
                      expanded={expanded === t.id}
                      onExpand={() =>
                        setExpanded(expanded === t.id ? null : t.id)
                      }
                      accepted={!!accepted[t.id]}
                      rejected={!!rejected[t.id]}
                      onAccept={() => toggleAccept(t.id)}
                      onReject={() => toggleReject(t.id)}
                    />
                  ))}
                </div>
              </section>
            )
          })}
        </PanelBody>
      </Tabs>

      <div className="border-warn/40 bg-warn-soft/40 space-y-2 border-t px-6 py-3.5">
        <div className="text-warn-ink flex items-center gap-1.5 text-[12px] font-medium">
          <AlertTriangleIcon className="size-[12px]" />
          Final review · Agent 3 will hand cases to script generation
        </div>
        <div className="flex items-center gap-2">
          <span className="text-ink-4 text-[11px]">
            {acceptedCount}/{TEST_CASES.length} cases accepted · {rejectedCount}{" "}
            rejected
          </span>
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" size="sm">
              Request more cases
            </Button>
            <Button
              variant="accent"
              size="sm"
              disabled={acceptedCount === 0}
              onClick={() => toast.success(`Generating scripts for ${acceptedCount} cases…`)}
            >
              <ZapIcon className="size-[13px]" />
              Generate {acceptedCount > 0 ? acceptedCount : ""} script
              {acceptedCount === 1 ? "" : "s"}
            </Button>
          </div>
        </div>
      </div>
    </PanelFrame>
  )
}

function Tab({ value, children }: { value: string; children: React.ReactNode }) {
  return (
    <TabsTrigger
      value={value}
      className="text-ink-3 data-[state=active]:text-foreground data-[state=active]:border-foreground hover:text-foreground gap-1.5 rounded-none border-b-2 border-transparent bg-transparent px-3 py-2.5 text-[12.5px] data-[state=active]:bg-transparent data-[state=active]:shadow-none"
    >
      {children}
    </TabsTrigger>
  )
}

function TestCaseRow({
  tc,
  expanded,
  onExpand,
  accepted,
  rejected,
  onAccept,
  onReject,
}: {
  tc: TestCase
  expanded: boolean
  onExpand: () => void
  accepted: boolean
  rejected: boolean
  onAccept: () => void
  onReject: () => void
}) {
  return (
    <div
      className={cn(
        "border-border bg-card hover:border-ink-4/50 rounded-md border px-3 py-2.5 transition-colors",
        expanded && "border-foreground/30"
      )}
    >
      <button
        type="button"
        onClick={onExpand}
        className="flex w-full items-start gap-3 text-left"
      >
        <span className="bg-muted text-ink-3 mt-0.5 shrink-0 rounded-[3px] px-1.5 py-0.5 font-mono text-[10.5px]">
          {tc.id}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-medium">
            {tc.title}
            {tc.priority && (
              <span className="ml-2">
                <Tag>{tc.priority}</Tag>
              </span>
            )}
          </div>
          <div className="text-ink-3 mt-0.5 text-[12.5px]">{tc.desc}</div>
        </div>
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <IconBtn
            label="Accept"
            on={accepted}
            kind="ok"
            onClick={onAccept}
            icon={<CheckIcon className="size-[12px]" />}
          />
          <IconBtn
            label="Reject"
            on={rejected}
            kind="err"
            onClick={onReject}
            icon={<XIcon className="size-[12px]" />}
          />
          <IconBtn
            label="Expand"
            on={false}
            kind="muted"
            onClick={onExpand}
            icon={
              expanded ? (
                <ChevronUpIcon className="size-[12px]" />
              ) : (
                <ChevronDownIcon className="size-[12px]" />
              )
            }
          />
        </div>
      </button>
      {expanded && (
        <div className="border-border mt-2.5 space-y-2 border-t pt-2.5 text-[12.5px]">
          {tc.steps && (
            <Field label="Steps">
              <ol className="mt-1 list-decimal space-y-0.5 pl-5">
                {tc.steps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            </Field>
          )}
          {tc.expect && (
            <Field label="Expected">
              <span>{tc.expect}</span>
            </Field>
          )}
          <div className="flex gap-2 pt-1">
            <Button variant="ghost" size="sm">
              <EditIcon className="size-[13px]" />
              Edit case
            </Button>
            <Button variant="ghost" size="sm">
              <BoltIcon className="size-[13px]" />
              Preview script
            </Button>
            <Button variant="ghost" size="sm">
              <CopyIcon className="size-[13px]" />
              Duplicate
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function IconBtn({
  on,
  kind,
  onClick,
  icon,
  label,
}: {
  on: boolean
  kind: "ok" | "err" | "muted"
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  const onCls =
    kind === "ok"
      ? "bg-ok text-white border-ok"
      : kind === "err"
        ? "bg-err text-white border-err"
        : "bg-muted text-ink-2"
  const hoverCls =
    kind === "ok"
      ? "hover:bg-ok-soft hover:text-ok-ink"
      : kind === "err"
        ? "hover:bg-err-soft hover:text-err-ink"
        : "hover:bg-muted"
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        "border-border text-ink-3 grid size-7 place-items-center rounded-md border transition-colors",
        hoverCls,
        on && onCls
      )}
    >
      {icon}
    </button>
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
    <div className="flex gap-3">
      <span className="text-ink-4 w-[72px] shrink-0 text-[11px] tracking-wider uppercase">
        {label}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
