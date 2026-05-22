"use client"

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  AlertTriangleIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  FileTextIcon,
  RefreshCwIcon,
  SendIcon,
} from "lucide-react"
import { toast } from "sonner"

import { CapLine } from "@/components/probe/cap-line"
import { RelativeTime, formatAbsolute, formatDuration } from "@/lib/format"
import { RunStatusBadge } from "@/components/probe/run-status-badge"
import { StatusDot } from "@/components/probe/status-dot"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  caseCategoryBadge,
  caseCategoryTitle,
  caseStatusLabel,
  eventLabel,
  nodeLabel,
  nodeOrderIndex,
  nodePhase,
  runPhaseTitle,
  runStatusDot,
  runStatusTone,
} from "@/lib/labels"
import {
  getFeatureExpectation,
  getProject,
  getRun,
  getTestCases,
  getTestScenario,
  listSandboxFiles,
  listSandboxScreenshots,
  readSandboxFile,
  runEventsUrl,
  sandboxFileUrl,
  submitFeedback,
  useFetch,
  useMutation,
  type FeatureExpectation,
  type Run,
  type SandboxFileList,
  type SandboxScreenshotList,
  type TestCase,
} from "@/lib/api"
import { useSetBreadcrumbs } from "@/lib/stores/breadcrumbs"
import { cn } from "@/lib/utils"

interface SseEvent {
  id: string
  type: string
  node_name: string
  payload: unknown
  created_at: string
}

const TERMINAL_STATUSES = new Set(["completed", "failed"])

const PHASE_ORDER = [
  "Setup",
  "Brief",
  "Sandbox",
  "Test cases",
  "Saving",
] as const

function findPhaseIndex(status: string | undefined, currentNode: string | null | undefined): number {
  if (!status) return 0
  if (status === "agent1_running" || status === "agent1_review") return 1
  if (status === "agent2_running") return 2
  if (status === "agent3_running" || status === "agent3_review") return 3
  if (status === "completed" || status === "failed") return 4
  if (currentNode) {
    return PHASE_ORDER.indexOf(nodePhase(currentNode) as (typeof PHASE_ORDER)[number])
  }
  return 0
}

export default function ProjectRunDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; runId: string }>
}) {
  const { projectId, runId } = use(params)
  const router = useRouter()

  const projectQ = useFetch(
    useCallback(() => getProject(projectId), [projectId]),
    [projectId],
  )

  const [run, setRun] = useState<Run | undefined>(undefined)
  const [runError, setRunError] = useState<Error | undefined>(undefined)

  const refreshRun = useCallback(async () => {
    try {
      const fresh = await getRun(runId)
      setRun(fresh)
      setRunError(undefined)
      return fresh
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e))
      setRunError(err)
      throw err
    }
  }, [runId])

  useEffect(() => {
    void refreshRun().catch(() => undefined)
    const t = setInterval(() => {
      if (run && TERMINAL_STATUSES.has(run.status)) return
      void refreshRun().catch(() => undefined)
    }, 4_000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshRun, run?.status])

  const scenarioQ = useFetch(
    useCallback(
      async () =>
        run?.test_scenario_id ? getTestScenario(run.test_scenario_id) : null,
      [run?.test_scenario_id],
    ),
    [run?.test_scenario_id],
  )

  const project = projectQ.data
  const scenario = scenarioQ.data ?? null

  useSetBreadcrumbs(
    project
      ? [
          { label: "Projects", href: "/projects" },
          { label: project.name, href: `/projects/${project.id}` },
          {
            label: "Feature tests",
            href: `/projects/${project.id}/testsets`,
            muted: true,
          },
          ...(scenario
            ? [
                {
                  label: scenario.title,
                  muted: true,
                  href: `/projects/${project.id}/testsets/${scenario.id}`,
                },
              ]
            : []),
          { label: `Run #${runId.slice(0, 8)}`, mono: true },
        ]
      : [{ label: "Projects", href: "/projects" }],
    "run",
    scenario
      ? {
          openTestHref: `/projects/${projectId}/testsets/${scenario.id}`,
        }
      : undefined,
  )

  // ── SSE ──────────────────────────────────────────────────────────────────

  const [events, setEvents] = useState<SseEvent[]>([])
  const eventIdsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    eventIdsRef.current = new Set()
    setEvents([])

    const url = runEventsUrl(runId)
    const es = new EventSource(url)

    const handle = (kind: string) => (e: MessageEvent) => {
      try {
        const parsed = JSON.parse(e.data) as Record<string, unknown>
        const id = typeof parsed.id === "string" ? parsed.id : `${Date.now()}-${kind}`
        if (eventIdsRef.current.has(id)) return
        eventIdsRef.current.add(id)
        setEvents((prev) => [
          ...prev,
          {
            id,
            type: kind,
            node_name: String(parsed.node_name ?? "—"),
            payload: parsed.payload,
            created_at: String(parsed.created_at ?? new Date().toISOString()),
          },
        ])
        if (kind === "done") {
          es.close()
          void refreshRun().catch(() => undefined)
        }
      } catch (err) {
        console.warn("SSE parse error", err)
      }
    }

    const types = [
      "node_start",
      "node_end",
      "interrupt",
      "feedback_received",
      "sandbox_task_created",
      "sandbox_task_progress",
      "sandbox_task_completed",
      "sandbox_task_failed",
      "workflow_completed",
      "error",
      "done",
    ]
    types.forEach((t) => es.addEventListener(t, handle(t)))
    es.onerror = () => {
      // Browser auto-retries; nothing to do.
    }
    return () => {
      es.close()
    }
  }, [runId, refreshRun])

  // ── Conditional sub-fetches ──────────────────────────────────────────────

  const showFE =
    !!run &&
    [
      "agent1_review",
      "agent2_running",
      "agent3_running",
      "agent3_review",
      "completed",
      "failed",
    ].includes(run.status)
  const feQ = useFetch(
    useCallback(
      async () => (showFE ? getFeatureExpectation(runId) : null),
      [showFE, runId],
    ),
    [showFE, runId, events.length],
  )

  const showCases = !!run && ["agent3_review", "completed"].includes(run.status)
  const casesQ = useFetch(
    useCallback(
      async () => (showCases ? getTestCases(runId) : []),
      [showCases, runId],
    ),
    [showCases, runId, events.length],
  )

  // Sandbox tab visible once the very first sandbox event has fired.
  const sandboxStarted = useMemo(
    () => events.some((e) => e.type === "sandbox_task_created"),
    [events],
  )

  // ── Feedback ─────────────────────────────────────────────────────────────

  const [feedbackText, setFeedbackText] = useState("")
  const feedback = useMutation(
    useCallback(
      async (decision: "approve" | "revise") => {
        const updated = await submitFeedback(runId, {
          decision,
          feedback: feedbackText.trim() || null,
        })
        return updated
      },
      [runId, feedbackText],
    ),
  )

  const submit = async (decision: "approve" | "revise") => {
    if (decision === "revise" && !feedbackText.trim()) {
      toast.error("Please describe what should change.")
      return
    }
    try {
      await feedback.run(decision)
      toast.success(decision === "approve" ? "Approved" : "Changes requested")
      setFeedbackText("")
      await refreshRun()
    } catch (e) {
      toast.error(`Could not submit: ${e instanceof Error ? e.message : e}`)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

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
    <div className="grid h-full grid-cols-[440px_minmax(0,1fr)] overflow-hidden">
      <aside className="border-border min-w-0 overflow-auto border-r">
        <Timeline
          run={run}
          runError={runError}
          events={events}
          onRefresh={async () => {
            await refreshRun().catch(() => undefined)
          }}
          runId={runId}
        />
      </aside>
      <section className="min-w-0 overflow-hidden">
        <RightPanel
          run={run}
          runId={runId}
          fe={feQ.data ?? undefined}
          cases={casesQ.data ?? []}
          sandboxStarted={sandboxStarted}
          feedbackText={feedbackText}
          onFeedbackTextChange={setFeedbackText}
          onSubmit={submit}
          submitting={feedback.loading}
        />
      </section>
    </div>
  )
}

/* ────────────────────────────  Timeline  ──────────────────────────── */

interface NodeBucket {
  node_name: string
  events: SseEvent[]
  isInterrupt: boolean
  isError: boolean
  startedAt?: string
  endedAt?: string
  /** For sandbox bucket, the latest progress status */
  sandboxStatus?: string
}

function bucketEvents(events: SseEvent[]): NodeBucket[] {
  const map = new Map<string, NodeBucket>()
  for (const e of events) {
    if (e.type === "done") continue
    let key = e.node_name
    // Sandbox events are emitted from the agent_2_placeholder node already,
    // so they naturally bucket together.
    if (!map.has(key)) {
      map.set(key, {
        node_name: key,
        events: [],
        isInterrupt: false,
        isError: false,
      })
    }
    const bucket = map.get(key)!
    bucket.events.push(e)
    if (e.type === "node_start") bucket.startedAt = e.created_at
    if (e.type === "node_end") bucket.endedAt = e.created_at
    if (e.type === "interrupt") bucket.isInterrupt = true
    if (e.type === "feedback_received") bucket.isInterrupt = false
    if (e.type === "error" || e.type === "sandbox_task_failed")
      bucket.isError = true
    if (e.type === "sandbox_task_progress") {
      const p = e.payload as Record<string, unknown> | null | undefined
      if (p && typeof p.status === "string") bucket.sandboxStatus = p.status
    }
    if (e.type === "sandbox_task_completed") bucket.sandboxStatus = "succeeded"
    if (e.type === "sandbox_task_failed") bucket.sandboxStatus = "failed"
  }

  const out = [...map.values()]
  out.sort((a, b) => {
    const ai = nodeOrderIndex(a.node_name)
    const bi = nodeOrderIndex(b.node_name)
    if (ai !== bi) return ai - bi
    const at = a.events[0]?.created_at ?? ""
    const bt = b.events[0]?.created_at ?? ""
    return at.localeCompare(bt)
  })
  return out
}

function bucketStatus(
  bucket: NodeBucket,
  runStatus: string | undefined,
): { label: string; tone: "ok" | "warn" | "err" | "accent" | "muted"; dot: "running" | "done" | "err" | "wait" } {
  if (bucket.isError) {
    return { label: "Failed", tone: "err", dot: "err" }
  }
  if (bucket.isInterrupt && !TERMINAL_STATUSES.has(runStatus ?? "")) {
    return { label: "Awaiting your review", tone: "warn", dot: "wait" }
  }
  if (bucket.endedAt) {
    let label = "Done"
    if (bucket.startedAt && bucket.endedAt) {
      const d = Date.parse(bucket.endedAt) - Date.parse(bucket.startedAt)
      if (Number.isFinite(d) && d >= 0) label = `Done in ${formatDuration(d)}`
    }
    return { label, tone: "ok", dot: "done" }
  }
  // Sandbox-specific running cues
  if (bucket.sandboxStatus) {
    const s = bucket.sandboxStatus
    if (s === "succeeded")
      return { label: "Done", tone: "ok", dot: "done" }
    if (s === "failed" || s === "cancelled" || s === "timeout")
      return { label: `Sandbox ${s}`, tone: "err", dot: "err" }
    return { label: `Sandbox ${s}`, tone: "accent", dot: "running" }
  }
  if (bucket.startedAt) {
    return { label: "Running", tone: "accent", dot: "running" }
  }
  return { label: "Queued", tone: "muted", dot: "wait" }
}

function Timeline({
  run,
  runError,
  events,
  onRefresh,
  runId,
}: {
  run: Run | undefined
  runError: Error | undefined
  events: SseEvent[]
  onRefresh: () => void | Promise<void>
  runId: string
}) {
  const status = run?.status ?? "pending"
  const buckets = useMemo(() => bucketEvents(events), [events])
  const phaseIndex = findPhaseIndex(status, run?.current_node)

  return (
    <div className="px-5 py-5">
      <div className="border-border bg-card mb-5 space-y-1.5 rounded-lg border p-4">
        <Row label="Run">
          <span className="font-mono">#{runId.slice(0, 8)}</span>
          <span className="ml-auto">
            <RunStatusBadge status={status} />
          </span>
        </Row>
        <Row label="Phase">
          <span className="font-medium">{runPhaseTitle(status)}</span>
          <span className="text-ink-4 ml-auto font-mono text-[11px]">
            {Math.min(phaseIndex + 1, PHASE_ORDER.length)} of {PHASE_ORDER.length}
          </span>
        </Row>
        <Row label="Started">
          <RelativeTime iso={run?.created_at} />
        </Row>
        {run?.error && (
          <div className="border-err/40 bg-err-soft text-err-ink mt-2 rounded-md border p-2 text-[12px]">
            {run.error}
          </div>
        )}
        {runError && (
          <div className="border-err/40 bg-err-soft text-err-ink mt-2 rounded-md border p-2 text-[12px]">
            Could not load run: {runError.message}
          </div>
        )}
      </div>

      <div className="mb-3 flex items-center justify-between">
        <CapLine>orchestration steps</CapLine>
        <Button variant="ghost" size="sm" onClick={() => void onRefresh()}>
          <RefreshCwIcon className="size-[12px]" />
          Refresh
        </Button>
      </div>

      <div className="space-y-2">
        {buckets.length === 0 ? (
          <div className="text-ink-3 px-1 text-[12.5px]">
            The orchestration just started. The first event will arrive in a
            few seconds…
          </div>
        ) : (
          buckets.map((b) => (
            <NodeCard key={b.node_name} bucket={b} runStatus={run?.status} />
          ))
        )}
      </div>
    </div>
  )
}

function NodeCard({
  bucket,
  runStatus,
}: {
  bucket: NodeBucket
  runStatus: string | undefined
}) {
  const [open, setOpen] = useState(false)
  const status = bucketStatus(bucket, runStatus)
  const eventCount = bucket.events.length
  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2.5",
        status.tone === "err" && "border-err/40 bg-err-soft/30",
        status.tone === "warn" && "border-warn/40 bg-warn-soft/30",
        status.tone === "accent" && "border-accent/40 bg-accent-soft/30",
        status.tone === "ok" && "border-ok/30 bg-card",
        status.tone === "muted" && "border-border bg-card",
      )}
    >
      <div className="flex items-center gap-2">
        <StatusDot kind={status.dot} size={6} />
        <div className="text-[13px] font-medium">
          {nodeLabel(bucket.node_name)}
        </div>
        <Badge
          variant={status.tone === "muted" ? "muted" : status.tone}
          className="ml-auto"
        >
          {status.label}
        </Badge>
      </div>
      <div className="text-ink-4 mt-1 flex items-center gap-2 text-[11px]">
        <span>{nodePhase(bucket.node_name)}</span>
        {bucket.startedAt && (
          <>
            <span>·</span>
            <RelativeTime iso={bucket.startedAt} />
          </>
        )}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="text-ink-3 hover:text-foreground ml-auto inline-flex items-center gap-0.5 text-[11px]"
        >
          {open ? (
            <ChevronDownIcon className="size-[11px]" />
          ) : (
            <ChevronRightIcon className="size-[11px]" />
          )}
          {eventCount} event{eventCount === 1 ? "" : "s"}
        </button>
      </div>

      {open && (
        <div className="border-border mt-2 space-y-1 border-t pt-2">
          {bucket.events.map((e) => (
            <EventLine key={e.id} e={e} />
          ))}
        </div>
      )}
    </div>
  )
}

function EventLine({ e }: { e: SseEvent }) {
  return (
    <div className="text-[11.5px] leading-snug">
      <div className="flex items-center gap-2">
        <span className="bg-muted text-ink-3 rounded-[3px] px-1.5 py-px font-mono text-[10px]">
          {eventLabel(e.type)}
        </span>
        <span className="text-ink-4 ml-auto font-mono text-[10.5px]">
          <RelativeTime iso={e.created_at} />
        </span>
      </div>
      {e.payload != null && (
        <pre className="text-ink-3 mt-1 overflow-x-auto whitespace-pre-wrap font-mono text-[11px]">
          {typeof e.payload === "string"
            ? e.payload
            : JSON.stringify(e.payload, null, 0)}
        </pre>
      )}
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
    <div className="flex items-center gap-2 text-[12.5px]">
      <span className="text-ink-3 w-[60px] shrink-0">{label}</span>
      <span className="flex min-w-0 flex-1 items-center gap-2">{children}</span>
    </div>
  )
}

/* ────────────────────────────  Right panel  ──────────────────────────── */

function RightPanel({
  run,
  runId,
  fe,
  cases,
  sandboxStarted,
  feedbackText,
  onFeedbackTextChange,
  onSubmit,
  submitting,
}: {
  run: Run | undefined
  runId: string
  fe: FeatureExpectation | undefined
  cases: TestCase[]
  sandboxStarted: boolean
  feedbackText: string
  onFeedbackTextChange: (s: string) => void
  onSubmit: (decision: "approve" | "revise") => void
  submitting: boolean
}) {
  const status = run?.status ?? "pending"
  const showReviewBar = status === "agent1_review" || status === "agent3_review"
  const reviewKind: "brief" | "cases" =
    status === "agent3_review" ? "cases" : "brief"

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-border flex items-center gap-3 border-b px-6 py-3.5">
        <div>
          <div className="text-[15px] font-semibold">{runPhaseTitle(status)}</div>
          <div className="text-ink-3 text-[12px]">
            {run?.current_node ? nodeLabel(run.current_node) : "Run details"}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <Tabs
          defaultValue={status === "agent3_review" ? "cases" : "brief"}
          className="flex min-h-0 flex-1 flex-col"
        >
          <TabsList className="border-border h-auto justify-start gap-1 rounded-none border-b bg-transparent px-6 py-0">
            <Tab value="brief">Brief {fe ? `· v${fe.version}` : ""}</Tab>
            <Tab value="cases">
              Test cases
              {cases.length > 0 && (
                <span className="bg-muted text-ink-3 ml-1.5 rounded-[3px] px-1.5 py-px font-mono text-[10px]">
                  {cases.length}
                </span>
              )}
            </Tab>
            {sandboxStarted && (
              <Tab value="sandbox">Sandbox activity</Tab>
            )}
          </TabsList>

          <TabsContent value="brief" className="px-6 py-5">
            {fe ? (
              <FeaturePanel fe={fe} />
            ) : (
              <div className="text-ink-3 text-[13px]">
                {showReviewBar
                  ? "Loading the brief…"
                  : "The brief will appear here once Agent 1 finishes drafting it."}
              </div>
            )}
          </TabsContent>

          <TabsContent value="cases" className="px-6 py-5">
            {cases.length > 0 ? (
              <CasesPanel cases={cases} />
            ) : (
              <div className="text-ink-3 text-[13px]">
                {status === "completed" || status === "agent3_review"
                  ? "No test cases yet."
                  : "Test cases will appear once Agent 3 generates them."}
              </div>
            )}
          </TabsContent>

          {sandboxStarted && (
            <TabsContent value="sandbox" className="px-6 py-5">
              <SandboxPanel runId={runId} runStatus={status} />
            </TabsContent>
          )}
        </Tabs>
      </div>

      {showReviewBar && (
        <div className="border-warn/40 bg-warn-soft/40 space-y-2 border-t px-6 py-3.5">
          <div className="text-warn-ink flex items-center gap-1.5 text-[12px] font-medium">
            <AlertTriangleIcon className="size-[12px]" />
            This run is paused. Review the {reviewKind === "brief" ? "brief" : "test cases"} above and approve or request changes.
          </div>
          <Textarea
            placeholder="Tell the agent what to change (only required if you request changes)."
            value={feedbackText}
            onChange={(e) => onFeedbackTextChange(e.target.value)}
            className="min-h-[60px] resize-none text-[13px]"
          />
          <div className="flex items-center gap-2">
            <span className="text-ink-4 text-[11px]">
              Approve to continue · Request changes will loop the agent back
            </span>
            <div className="ml-auto flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={submitting}
                onClick={() => onSubmit("revise")}
              >
                <SendIcon className="size-[13px]" />
                Request changes
              </Button>
              <Button
                variant="accent"
                size="sm"
                disabled={submitting}
                onClick={() => onSubmit("approve")}
              >
                <CheckIcon className="size-[13px]" />
                Approve & continue
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Tab({
  value,
  children,
}: {
  value: string
  children: React.ReactNode
}) {
  return (
    <TabsTrigger
      value={value}
      className="text-ink-3 data-[state=active]:text-foreground data-[state=active]:border-foreground hover:text-foreground gap-1.5 rounded-none border-b-2 border-transparent bg-transparent px-3 py-2.5 text-[12.5px] data-[state=active]:bg-transparent data-[state=active]:shadow-none"
    >
      {children}
    </TabsTrigger>
  )
}

/* ────────────────────────  Brief & cases  ──────────────────────── */

function FeaturePanel({ fe }: { fe: FeatureExpectation }) {
  const c = (fe.content ?? {}) as Record<string, unknown>
  return (
    <div className="max-w-[820px] space-y-5">
      <div>
        <Badge variant={fe.status === "approved" ? "ok" : "muted"}>
          {fe.status === "approved" ? "Approved" : fe.status === "rejected" ? "Needs changes" : "Draft"} · v{fe.version}
        </Badge>
      </div>
      {typeof c.feature_overview === "string" && (
        <Section title="What this feature does">
          <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed">
            {c.feature_overview}
          </p>
        </Section>
      )}
      {Array.isArray(c.user_flows) && c.user_flows.length > 0 && (
        <Section title="How users interact with it">
          <ul className="space-y-3 text-[13.5px]">
            {(c.user_flows as Array<Record<string, unknown>>).map((f, i) => (
              <li key={i} className="border-border bg-card rounded-md border p-3">
                <div className="font-medium">{String(f.name ?? "")}</div>
                {Array.isArray(f.steps) && (
                  <ol className="text-ink-2 mt-1 list-decimal space-y-0.5 pl-5">
                    {(f.steps as unknown[]).map((s, j) => (
                      <li key={j}>{String(s)}</li>
                    ))}
                  </ol>
                )}
                {typeof f.expected_outcome === "string" && (
                  <div className="text-ink-3 mt-1 text-[12.5px]">
                    Expected: {f.expected_outcome}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}
      {typeof c.data_contracts === "string" && (
        <Section title="Inputs and outputs">
          <pre className="bg-muted whitespace-pre-wrap rounded-md p-3 font-mono text-[12px] leading-snug">
            {c.data_contracts}
          </pre>
        </Section>
      )}
      {Array.isArray(c.edge_cases) && (
        <Section title="Edge cases to consider">
          <ul className="list-disc space-y-1 pl-5 text-[13.5px]">
            {(c.edge_cases as unknown[]).map((s, i) => (
              <li key={i}>{String(s)}</li>
            ))}
          </ul>
        </Section>
      )}
      {Array.isArray(c.expanded_acceptance_criteria) && (
        <Section title="What needs to be true to pass">
          <div className="space-y-2">
            {(c.expanded_acceptance_criteria as unknown[]).map((t, i) => (
              <div
                key={i}
                className="border-border bg-card flex items-start gap-3 rounded-md border p-3"
              >
                <span className="bg-foreground text-background mt-0.5 shrink-0 rounded-[4px] px-1.5 py-0.5 font-mono text-[10.5px] font-semibold">
                  AC{i + 1}
                </span>
                <span className="text-[13px]">{String(t)}</span>
              </div>
            ))}
          </div>
        </Section>
      )}
      {Array.isArray(c.dependencies_and_assumptions) && (
        <Section title="What we're assuming">
          <ul className="list-disc space-y-1 pl-5 text-[13.5px]">
            {(c.dependencies_and_assumptions as unknown[]).map((s, i) => (
              <li key={i}>{String(s)}</li>
            ))}
          </ul>
        </Section>
      )}
      {fe.feedback && (
        <Section title="Reviewer feedback">
          <pre className="bg-muted whitespace-pre-wrap rounded-md p-3 font-mono text-[12px] leading-snug">
            {fe.feedback}
          </pre>
        </Section>
      )}
    </div>
  )
}

function CasesPanel({ cases }: { cases: TestCase[] }) {
  const grouped = useMemo(() => {
    const byCategory: Record<string, TestCase[]> = {
      happy: [],
      edge: [],
      corner: [],
    }
    for (const c of cases) {
      if (!byCategory[c.category]) byCategory[c.category] = []
      byCategory[c.category]!.push(c)
    }
    return byCategory
  }, [cases])

  return (
    <div className="max-w-[820px] space-y-6">
      {(["happy", "edge", "corner"] as const).map((kind) => {
        const items = grouped[kind] ?? []
        if (items.length === 0) return null
        return (
          <section key={kind}>
            <div className="mb-2 flex items-center gap-2">
              <h3 className="text-[15px] font-semibold">
                {caseCategoryBadge(kind)}
              </h3>
              <Badge variant="muted">{items.length}</Badge>
              <span className="text-ink-3 text-[12px]">
                {caseCategoryTitle(kind)}
              </span>
            </div>
            <div className="space-y-2">
              {items.map((tc) => (
                <div
                  key={tc.id}
                  className="border-border bg-card rounded-md border p-3"
                >
                  <div className="flex items-center gap-2">
                    <span className="bg-muted text-ink-3 rounded-[3px] px-1.5 py-px font-mono text-[10.5px]">
                      {tc.id.slice(0, 8)}
                    </span>
                    <span className="text-[13.5px] font-medium">{tc.title}</span>
                    <Badge
                      variant={
                        tc.status === "approved"
                          ? "ok"
                          : tc.status === "rejected"
                            ? "err"
                            : "muted"
                      }
                      className="ml-auto"
                    >
                      {caseStatusLabel(tc.status)}
                    </Badge>
                  </div>
                  <p className="text-ink-3 mt-1 text-[12.5px]">
                    {tc.description}
                  </p>
                  {tc.preconditions && (
                    <div className="text-ink-4 mt-1 text-[12px]">
                      Before you start: {tc.preconditions}
                    </div>
                  )}
                  {Array.isArray(tc.steps) && tc.steps.length > 0 && (
                    <ol className="text-ink-2 mt-2 list-decimal space-y-0.5 pl-5 text-[12.5px]">
                      {(tc.steps as Array<Record<string, unknown>>).map(
                        (s, i) => (
                          <li key={i}>
                            {String(s.action ?? "")}
                            {typeof s.expected === "string" && (
                              <span className="text-ink-4">
                                {" "}— {String(s.expected)}
                              </span>
                            )}
                          </li>
                        ),
                      )}
                    </ol>
                  )}
                  <div className="text-ink-3 mt-2 text-[12.5px]">
                    Expected: {tc.expected_result}
                  </div>
                  {tc.rationale && (
                    <div className="text-ink-4 mt-1 text-[12px]">
                      Why it matters: {tc.rationale}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )
      })}
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
      <CapLine className="mb-2">{title}</CapLine>
      <div>{children}</div>
    </section>
  )
}

/* ────────────────────────────  Sandbox panel  ──────────────────────────── */

interface ParsedTraceLine {
  ts?: string
  kind?: string
  text?: string
  name?: string
  status_code?: number
  raw: string
}

function parseTraceLines(text: string): ParsedTraceLine[] {
  return text
    .split("\n")
    .filter((l) => l.trim())
    .map((line) => {
      try {
        const obj = JSON.parse(line) as Record<string, unknown>
        return {
          ts: typeof obj.ts === "string" ? obj.ts : undefined,
          kind: typeof obj.kind === "string" ? obj.kind : undefined,
          text:
            typeof obj.text === "string"
              ? obj.text
              : typeof obj.output === "string"
                ? (obj.output as string)
                : undefined,
          name: typeof obj.name === "string" ? obj.name : undefined,
          status_code:
            typeof obj.status_code === "number" ? obj.status_code : undefined,
          raw: line,
        }
      } catch {
        return { raw: line } as ParsedTraceLine
      }
    })
}

interface ParsedEventLine {
  ts?: string
  kind?: string
  msg?: string
  raw: string
}

function parseEventsLines(text: string): ParsedEventLine[] {
  return text
    .split("\n")
    .filter((l) => l.trim())
    .map((line) => {
      try {
        const obj = JSON.parse(line) as Record<string, unknown>
        return {
          ts: typeof obj.ts === "string" ? obj.ts : undefined,
          kind: typeof obj.kind === "string" ? obj.kind : undefined,
          msg: typeof obj.msg === "string" ? obj.msg : undefined,
          raw: line,
        }
      } catch {
        return { raw: line } as ParsedEventLine
      }
    })
}

const TRACE_KIND_LABEL: Record<string, string> = {
  run_start: "Run started",
  api_response: "API response",
  assistant_text: "Assistant said",
  thinking: "Thinking",
  tool_use: "Tool used",
  tool_result: "Tool result",
  run_end: "Run ended",
  run_error: "Run errored",
}

function SandboxPanel({
  runId,
  runStatus,
}: {
  runId: string
  runStatus: string
}) {
  const filesQ = useFetch(
    useCallback(() => listSandboxFiles(runId), [runId]),
    [runId],
  )

  // Poll while sandbox is still running.
  useEffect(() => {
    if (runStatus !== "agent2_running") return
    const t = setInterval(() => {
      void filesQ.mutate()
    }, 5_000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runStatus, filesQ.mutate])

  if (filesQ.error) {
    return (
      <div className="text-ink-3 text-[13px]">
        Could not list sandbox files: {filesQ.error.message}
      </div>
    )
  }

  const list: SandboxFileList | undefined = filesQ.data
  if (!list) {
    return <div className="text-ink-3 text-[13px]">Loading sandbox files…</div>
  }

  const findings = list.files.find(
    (f) => f.path === "output/workspace/findings.md",
  )
  const events = list.files.find(
    (f) => f.path === "output/workspace/events.jsonl",
  )
  const trace = list.files.find((f) => f.path === "output/trace.jsonl")
  const others = list.files.filter(
    (f) =>
      f.path !== "output/workspace/findings.md" &&
      f.path !== "output/workspace/events.jsonl" &&
      f.path !== "output/trace.jsonl" &&
      f.path !== "output/.ready" &&
      f.path !== "input.json" &&
      !f.path.startsWith("output/screenshots/"),
  )

  return (
    <div className="max-w-[820px] space-y-6">
      <div className="text-ink-3 text-[12.5px]">
        Sandbox task <span className="font-mono">{list.task_id.slice(0, 8)}</span>
        {" · "}
        {list.files.length} file{list.files.length === 1 ? "" : "s"}
      </div>

      <LiveScreenView runId={runId} runStatus={runStatus} />

      {findings && <FindingsBlock runId={runId} path={findings.path} />}
      {events && <EventsBlock runId={runId} path={events.path} />}
      {trace && <TraceBlock runId={runId} path={trace.path} />}

      {others.length > 0 && (
        <Section title="Other artifacts">
          <ul className="space-y-1.5 text-[13px]">
            {others.map((f) => (
              <li key={f.path} className="flex items-center gap-2">
                <FileTextIcon className="text-ink-4 size-[12px]" />
                <a
                  href={sandboxFileUrl(runId, f.path)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-foreground hover:underline"
                >
                  {f.path}
                </a>
                <span className="text-ink-4 ml-auto font-mono text-[11px]">
                  {f.size} B
                </span>
                <ExternalLinkIcon className="text-ink-4 size-[11px]" />
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  )
}

function FindingsBlock({
  runId,
  path,
}: {
  runId: string
  path: string
}) {
  const q = useFetch(
    useCallback(() => readSandboxFile(runId, path), [runId, path]),
    [runId, path],
  )
  return (
    <Section title="Findings">
      {q.loading ? (
        <div className="text-ink-3 text-[12.5px]">Loading findings.md…</div>
      ) : q.error ? (
        <div className="text-err-ink text-[12.5px]">{q.error.message}</div>
      ) : (
        <pre className="border-border bg-card max-h-[480px] overflow-auto whitespace-pre-wrap rounded-md border p-3 text-[12.5px] leading-relaxed">
          {q.data ?? "(empty)"}
        </pre>
      )}
    </Section>
  )
}

function EventsBlock({
  runId,
  path,
}: {
  runId: string
  path: string
}) {
  const q = useFetch(
    useCallback(() => readSandboxFile(runId, path), [runId, path]),
    [runId, path],
  )
  if (q.error) return null
  const lines = q.data ? parseEventsLines(q.data) : []
  return (
    <Section title="Activity log">
      {q.loading ? (
        <div className="text-ink-3 text-[12.5px]">Loading events.jsonl…</div>
      ) : lines.length === 0 ? (
        <div className="text-ink-3 text-[12.5px]">No activity recorded yet.</div>
      ) : (
        <div className="border-border bg-card max-h-[360px] overflow-auto rounded-md border">
          <ul className="divide-border divide-y">
            {lines.map((l, i) => (
              <li key={i} className="flex gap-3 px-3 py-2 text-[12.5px]">
                <span className="text-ink-4 w-[68px] shrink-0 font-mono text-[11px]">
                  {l.ts ? formatAbsolute(l.ts).split(", ")[1] ?? "" : ""}
                </span>
                {l.kind && (
                  <span className="bg-muted text-ink-3 h-fit rounded-[3px] px-1.5 py-px font-mono text-[10px]">
                    {l.kind}
                  </span>
                )}
                <span className="text-ink-2 min-w-0 flex-1 break-words">
                  {l.msg ?? l.raw}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  )
}

function TraceBlock({
  runId,
  path,
}: {
  runId: string
  path: string
}) {
  const [open, setOpen] = useState(false)
  const q = useFetch(
    useCallback(
      async () => (open ? readSandboxFile(runId, path) : null),
      [open, runId, path],
    ),
    [open, runId, path],
  )
  const lines = q.data ? parseTraceLines(q.data) : []
  return (
    <Section title="Detailed trace">
      <div className="text-ink-3 mb-2 text-[12.5px]">
        Every Anthropic API call, tool invocation, and result the sandbox made.
        Useful for debugging.
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? (
          <ChevronDownIcon className="size-[12px]" />
        ) : (
          <ChevronRightIcon className="size-[12px]" />
        )}
        {open ? "Hide trace" : "Show trace"}
      </Button>
      {open && (
        <div className="mt-2">
          {q.loading ? (
            <div className="text-ink-3 text-[12.5px]">Loading trace.jsonl…</div>
          ) : q.error ? (
            <div className="text-err-ink text-[12.5px]">{q.error.message}</div>
          ) : lines.length === 0 ? (
            <div className="text-ink-3 text-[12.5px]">Trace is empty.</div>
          ) : (
            <div className="border-border bg-card max-h-[400px] overflow-auto rounded-md border">
              <ul className="divide-border divide-y">
                {lines.map((l, i) => (
                  <li key={i} className="px-3 py-2 text-[12.5px]">
                    <div className="flex items-center gap-2">
                      <span className="text-ink-4 font-mono text-[10.5px]">
                        {l.ts ? formatAbsolute(l.ts).split(", ")[1] ?? "" : ""}
                      </span>
                      <span className="bg-muted text-ink-3 rounded-[3px] px-1.5 py-px font-mono text-[10px]">
                        {l.kind ? TRACE_KIND_LABEL[l.kind] ?? l.kind : "raw"}
                      </span>
                      {l.name && (
                        <span className="text-ink-3 font-mono text-[11px]">
                          {l.name}
                        </span>
                      )}
                      {typeof l.status_code === "number" && (
                        <span className="text-ink-3 font-mono text-[11px]">
                          {l.status_code}
                        </span>
                      )}
                    </div>
                    {l.text && (
                      <div className="text-ink-2 mt-1 line-clamp-3 whitespace-pre-wrap text-[12.5px]">
                        {l.text}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Section>
  )
}

/* ────────────────────────────  Live screen view  ──────────────────────── */

function LiveScreenView({
  runId,
  runStatus,
}: {
  runId: string
  runStatus: string
}) {
  const isLive = runStatus === "agent2_running"
  const screenshotsQ = useFetch(
    useCallback(() => listSandboxScreenshots(runId), [runId]),
    [runId],
  )

  // Poll while the sandbox is exploring so the latest screenshot keeps
  // refreshing. Bail once the run exits agent2_running.
  useEffect(() => {
    if (!isLive) return
    const t = setInterval(() => {
      void screenshotsQ.mutate()
    }, 2_500)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLive, screenshotsQ.mutate])

  const list: SandboxScreenshotList | undefined = screenshotsQ.data
  const screenshots = list?.screenshots ?? []
  const latestPath = screenshots.length > 0 ? screenshots[screenshots.length - 1]!.path : null

  // Whether the user is currently pinned to a particular screenshot or
  // wants to follow the latest. Default: follow.
  const [pinned, setPinned] = useState<string | null>(null)

  // When new screenshots arrive while we're in "follow" mode, the
  // displayed image automatically rolls forward to the newest.
  const displayedPath = pinned ?? latestPath
  const displayed = screenshots.find((s) => s.path === displayedPath) ??
    screenshots[screenshots.length - 1] ??
    null

  if (screenshotsQ.error) {
    return (
      <Section title="Live computer view">
        <div className="text-err-ink text-[12.5px]">
          {screenshotsQ.error.message}
        </div>
      </Section>
    )
  }

  if (screenshotsQ.loading && screenshots.length === 0) {
    return (
      <Section title="Live computer view">
        <div className="text-ink-3 text-[12.5px]">Looking for screenshots…</div>
      </Section>
    )
  }

  if (screenshots.length === 0) {
    return (
      <Section title="Live computer view">
        <div className="border-border bg-card text-ink-3 rounded-md border border-dashed px-3 py-6 text-center text-[12.5px]">
          {isLive
            ? "Claude hasn't taken any screenshots yet. They'll appear here as soon as it does."
            : "No screenshots were captured during this run."}
        </div>
      </Section>
    )
  }

  return (
    <Section title="Live computer view">
      <div className="border-border bg-card overflow-hidden rounded-lg border">
        <div className="border-border bg-muted/40 flex items-center gap-2 border-b px-3 py-2">
          <div className="flex gap-1.5">
            <span className="bg-err size-2.5 rounded-full opacity-60" />
            <span className="bg-warn size-2.5 rounded-full opacity-60" />
            <span className="bg-ok size-2.5 rounded-full opacity-60" />
          </div>
          <span className="text-ink-3 ml-2 font-mono text-[11px]">
            {displayed?.path.split("/").pop()}
          </span>
          {isLive && (
            <Badge variant="accent" className="ml-2 gap-1.5">
              <span className="bg-accent-ink size-1.5 animate-pulse rounded-full" />
              {pinned ? "paused" : "live"}
            </Badge>
          )}
          <span className="text-ink-4 ml-auto font-mono text-[11px]">
            {screenshots.length} frame{screenshots.length === 1 ? "" : "s"}
          </span>
          {pinned && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPinned(null)}
            >
              Follow latest
            </Button>
          )}
        </div>
        <div className="bg-background relative aspect-[16/10] w-full">
          {displayed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={displayed.path}
              src={sandboxFileUrl(runId, displayed.path)}
              alt={`Sandbox screenshot ${displayed.path}`}
              className="h-full w-full object-contain"
              loading="lazy"
            />
          ) : null}
        </div>
        {screenshots.length > 1 && (
          <div className="border-border flex gap-1.5 overflow-x-auto border-t px-3 py-2">
            {screenshots.map((s, i) => (
              <button
                key={s.path}
                type="button"
                onClick={() =>
                  setPinned(
                    pinned === s.path
                      ? null
                      : i === screenshots.length - 1
                        ? null
                        : s.path,
                  )
                }
                className={cn(
                  "border-border relative h-12 w-20 shrink-0 overflow-hidden rounded border bg-black",
                  displayed?.path === s.path
                    ? "ring-foreground/60 ring-2"
                    : "hover:border-ink-4/60",
                )}
                title={s.path.split("/").pop()}
                aria-label={`Open ${s.path}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={sandboxFileUrl(runId, s.path)}
                  alt=""
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
                <span className="bg-black/60 text-background absolute right-1 bottom-1 rounded px-1 font-mono text-[9px]">
                  {i + 1}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </Section>
  )
}
