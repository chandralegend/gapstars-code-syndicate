"use client"

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  AlertTriangleIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  Code2Icon,
  DownloadIcon,
  ExternalLinkIcon,
  FileTextIcon,
  PlayIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  SendIcon,
  TimerIcon,
} from "lucide-react"
import { toast } from "sonner"

import { CapLine } from "@/components/probe/cap-line"
import { RelativeTime, formatAbsolute, formatDuration } from "@/lib/format"
import { RunStatusBadge } from "@/components/probe/run-status-badge"
import { StatusDot } from "@/components/probe/status-dot"
import { PageContainer } from "@/components/shell/page-container"
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
  eventSummary,
  nodeLabel,
  nodeOrderIndex,
  nodePhase,
  runPhaseTitle,
  runStatusDot,
  runStatusTone,
  shouldShowEvent,
  runStepperState,
} from "@/lib/labels"
import {
  cancelTestExecution,
  createTestExecution,
  executionArtifactUrl,
  extendSandboxTimeout,
  generateTestScripts,
  getFeatureExpectation,
  getLatestScriptBundle,
  getProject,
  getRun,
  getSandboxStatus,
  getTestCases,
  getTestExecution,
  getTestScenario,
  listSandboxFiles,
  listSandboxScreenshots,
  listScriptBundleFiles,
  listTestExecutions,
  readSandboxFile,
  readScriptBundleFile,
  runEventsUrl,
  sandboxFileUrl,
  scriptBundleDownloadUrl,
  submitFeedback,
  useFetch,
  useMutation,
  type FeatureExpectation,
  type Run,
  type SandboxFileList,
  type SandboxScreenshotList,
  type SandboxStatus,
  type TestCase,
  type TestExecution,
  type TestExecutionDetail,
  type TestExecutionResult,
  type TestScriptBundle,
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
    {
      openTestHref: scenario
        ? `/projects/${projectId}/testsets/${scenario.id}`
        : undefined,
      runStatus: run?.status,
    },
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
      "sandbox_task_recovered",
      "sandbox_timeout_warning",
      "sandbox_timeout_extended",
      "workflow_completed",
      "script_bundle_started",
      "script_bundle_progress",
      "script_bundle_succeeded",
      "script_bundle_failed",
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
    <PageContainer size="wide" className="h-full">
      <div className="grid h-full grid-cols-1 overflow-hidden lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="border-border min-w-0 overflow-auto border-b lg:border-r lg:border-b-0">
          <Timeline
            run={run}
            runError={runError}
            events={events}
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
    </PageContainer>
  )
}

/* ────────────────────────────  Phase stepper  ──────────────────────── */

function PhaseStepper({ status }: { status: string }) {
  const steps = useMemo(() => runStepperState(status), [status])
  return (
    <ol
      className="flex items-center gap-1.5"
      aria-label="Run phases"
    >
      {steps.map((s, i) => {
        const dotClass =
          s.state === "done"
            ? "bg-ok"
            : s.state === "active"
              ? "bg-accent"
              : "bg-ink-4/40"
        const labelClass =
          s.state === "active"
            ? "text-foreground font-medium"
            : s.state === "done"
              ? "text-ink-3"
              : "text-ink-4"
        return (
          <li key={s.key} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className={cn("h-1.5 w-1.5 rounded-full", dotClass)}
            />
            <span className={cn("text-[11.5px]", labelClass)}>{s.label}</span>
            {i < steps.length - 1 && (
              <span aria-hidden className="bg-ink-4/30 h-px w-3" />
            )}
            {s.state === "active" && (
              <span className="sr-only">(current)</span>
            )}
          </li>
        )
      })}
    </ol>
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
  runId,
}: {
  run: Run | undefined
  runError: Error | undefined
  events: SseEvent[]
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

      <CapLine className="mb-3">orchestration steps</CapLine>

      <div className="space-y-2">
        {buckets.length === 0 ? (
          <div className="text-ink-3 px-1 text-[12.5px]">
            The orchestration just started. The first event will arrive in a
            few seconds.
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
  // Drop noisy / superseded events. The bucket header already shows
  // the outcome of the phase, so we don't need every transitional
  // breadcrumb. shouldShowEvent walks the *future* of the bucket so
  // it can hide an early progress event when a later one exists.
  const visibleEvents = useMemo(() => {
    const out: SseEvent[] = []
    for (let i = 0; i < bucket.events.length; i += 1) {
      const e = bucket.events[i]
      if (shouldShowEvent(e, bucket.events.slice(i + 1))) {
        out.push(e)
      }
    }
    return out
  }, [bucket.events])
  const eventCount = visibleEvents.length
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
        <div className="border-border mt-2 space-y-2 border-t pt-2">
          {visibleEvents.length === 0 ? (
            <div className="text-ink-4 text-[11.5px]">
              No events to show beyond the summary above.
            </div>
          ) : (
            visibleEvents.map((e) => <EventLine key={e.id} e={e} />)
          )}
        </div>
      )}
    </div>
  )
}

function EventLine({ e }: { e: SseEvent }) {
  const summary = eventSummary(e.type, e.payload)
  const hasPayload =
    e.payload != null &&
    typeof e.payload === "object" &&
    Object.keys(e.payload as Record<string, unknown>).length > 0
  return (
    <div className="text-[12px] leading-snug">
      <div className="flex items-baseline gap-2">
        <span className="text-foreground font-medium">
          {eventLabel(e.type)}
        </span>
        {summary && (
          <span className="text-ink-3 truncate">{summary}</span>
        )}
        <span className="text-ink-4 ml-auto shrink-0 font-mono text-[10.5px]">
          <RelativeTime iso={e.created_at} />
        </span>
      </div>
      {hasPayload && (
        <details className="group/det mt-1">
          <summary className="text-ink-4 hover:text-ink-3 cursor-pointer list-none text-[10.5px] select-none">
            <span className="group-open/det:hidden">Show details</span>
            <span className="hidden group-open/det:inline">Hide details</span>
          </summary>
          <pre className="text-ink-3 bg-muted/50 mt-1 max-h-[200px] overflow-auto rounded-[4px] p-2 font-mono text-[10.5px] whitespace-pre-wrap">
            {JSON.stringify(e.payload, null, 2)}
          </pre>
        </details>
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
  const sandboxRunning = status === "agent2_running"

  // Default tab follows the run's phase, so the user always lands on
  // the most useful surface for the current state of the world.
  const defaultTab =
    status === "agent2_running"
      ? "sandbox"
      : status === "agent3_review" || status === "completed"
        ? "cases"
        : "brief"

  // The right pane is wider than its content needs to be on big
  // monitors. We keep the chrome (header, tabs underline, review bar)
  // edge-to-edge but cap the *content* on a centered rail so prose
  // and forms stay readable.
  const rail = "mx-auto w-full max-w-[880px]"

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-border border-b px-6 py-3.5">
        <div className={cn(rail, "flex flex-wrap items-center gap-x-3 gap-y-2")}>
          <div className="min-w-0">
            <div className="text-[15px] font-semibold">{runPhaseTitle(status)}</div>
            <div className="text-ink-3 text-[12px]">
              {run?.current_node
                ? nodeLabel(run.current_node)
                : "Waiting to start"}
            </div>
          </div>
          <div className="ml-auto">
            <PhaseStepper status={status} />
          </div>
        </div>
      </div>

      {sandboxRunning && (
        <div className="border-border border-b bg-muted/30 px-6 py-4">
          <div className={rail}>
            <LiveScreenView runId={runId} runStatus={status} />
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto">
        <Tabs
          defaultValue={defaultTab}
          className="flex min-h-0 flex-1 flex-col"
        >
          <TabsList className="border-border h-auto justify-start gap-1 rounded-none border-b bg-transparent px-6 py-0">
            <div className={cn(rail, "flex items-center gap-1")}>
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
                <Tab value="sandbox">
                  {sandboxRunning ? "Sandbox details" : "Sandbox activity"}
                </Tab>
              )}
              {status === "completed" && (
                <Tab value="scripts">Test scripts</Tab>
              )}
              {status === "completed" && (
                <Tab value="results">Test results</Tab>
              )}
            </div>
          </TabsList>

          <TabsContent value="brief" className="px-6 py-5">
            <div className={rail}>
              {fe ? (
                <FeaturePanel fe={fe} />
              ) : (
                <div className="text-ink-3 text-[13px]">
                  {showReviewBar
                    ? "Loading the brief…"
                    : "The brief will appear here once Agent 1 finishes drafting it."}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="cases" className="px-6 py-5">
            <div className={rail}>
              {cases.length > 0 ? (
                <CasesPanel cases={cases} />
              ) : (
                <div className="text-ink-3 text-[13px]">
                  {status === "completed" || status === "agent3_review"
                    ? "No test cases yet."
                    : "Test cases will appear once Agent 3 generates them."}
                </div>
              )}
            </div>
          </TabsContent>

          {sandboxStarted && (
            <TabsContent value="sandbox" className="px-6 py-5">
              <div className={rail}>
                <SandboxPanel
                  runId={runId}
                  runStatus={status}
                  hideLiveView={sandboxRunning}
                />
              </div>
            </TabsContent>
          )}

          {status === "completed" && (
            <TabsContent value="scripts" className="px-6 py-5">
              <div className={rail}>
                <ScriptsPanel runId={runId} />
              </div>
            </TabsContent>
          )}

          {status === "completed" && (
            <TabsContent value="results" className="px-6 py-5">
              <div className={rail}>
                <TestResultsPanel runId={runId} />
              </div>
            </TabsContent>
          )}
        </Tabs>
      </div>

      {showReviewBar && (
        <div className="border-warn/40 bg-warn-soft/40 border-t px-6 py-3.5">
          <div className={cn(rail, "space-y-2")}>
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
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-ink-4 text-[11px]">
                Approve to continue. Request changes loops the agent back.
              </span>
              <div className="ml-auto flex flex-wrap gap-2">
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
                                {": "}
                                {String(s.expected)}
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
  hideLiveView = false,
}: {
  runId: string
  runStatus: string
  hideLiveView?: boolean
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

      {!hideLiveView && (
        <LiveScreenView runId={runId} runStatus={runStatus} />
      )}

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

  return (
    <Section title="Live computer view">
      {isLive && <DeadlineBar runId={runId} />}

      {screenshotsQ.loading && screenshots.length === 0 ? (
        <div className="text-ink-3 text-[12.5px]">Looking for screenshots…</div>
      ) : screenshots.length === 0 ? (
        <div className="border-border bg-card text-ink-3 rounded-md border border-dashed px-3 py-6 text-center text-[12.5px]">
          {isLive
            ? "Claude hasn't taken any screenshots yet. They'll appear here as soon as it does."
            : "No screenshots were captured during this run."}
        </div>
      ) : (
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
      )}
    </Section>
  )
}

/**
 * Live deadline strip: shows how much time the sandbox has left and lets
 * the user add more. Only rendered while the run is in agent2_running.
 */
function DeadlineBar({ runId }: { runId: string }) {
  const statusQ = useFetch(
    useCallback(() => getSandboxStatus(runId), [runId]),
    [runId],
  )

  // Pull the live timeout/elapsed every 5s so the countdown stays
  // close to reality. The local ticker below interpolates between
  // those checkpoints.
  useEffect(() => {
    const t = setInterval(() => {
      void statusQ.mutate()
    }, 5_000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusQ.mutate])

  // Local 1-Hz ticker so the countdown actually decrements.
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1_000)
    return () => clearInterval(t)
  }, [])

  const extend = useMutation(
    useCallback(
      async (extra: number) => extendSandboxTimeout(runId, extra),
      [runId],
    ),
  )

  const status: SandboxStatus | undefined = statusQ.data
  // Best-effort interpolation: subtract local-clock seconds since the
  // last server snapshot from the server-reported remaining.
  const lastFetchedAt = useRef<number>(Date.now())
  useEffect(() => {
    lastFetchedAt.current = Date.now()
  }, [status?.remaining_seconds])
  const interpolated = useMemo(() => {
    if (!status?.remaining_seconds && status?.remaining_seconds !== 0) return null
    const sinceFetch = (Date.now() - lastFetchedAt.current) / 1000
    return Math.max(0, (status.remaining_seconds ?? 0) - sinceFetch)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.remaining_seconds, tick])

  const total = status?.timeout_seconds ?? 0
  const remaining = interpolated ?? 0
  const elapsedPct =
    total > 0 ? Math.min(100, Math.max(0, ((total - remaining) / total) * 100)) : 0
  const isLow = remaining > 0 && remaining < 60
  const isCritical = remaining > 0 && remaining < 30

  const tone = isCritical ? "err" : isLow ? "warn" : "muted"

  const handleExtend = async (extra: number) => {
    try {
      await extend.run(extra)
      toast.success(`Sandbox got an extra ${extra / 60} min`)
      await statusQ.mutate()
    } catch (e) {
      toast.error(
        `Could not extend: ${e instanceof Error ? e.message : String(e)}`,
      )
    }
  }

  if (!status) return null

  return (
    <div
      className={cn(
        "mb-3 flex items-center gap-3 rounded-md border px-3 py-2 text-[12.5px]",
        tone === "err" && "border-err/50 bg-err-soft/40 text-err-ink",
        tone === "warn" && "border-warn/50 bg-warn-soft/40 text-warn-ink",
        tone === "muted" && "border-border bg-card text-ink-2",
      )}
    >
      <TimerIcon className="size-[14px] shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium">
            {remaining > 0
              ? `Sandbox deadline in ${formatRemainingShort(remaining)}`
              : "Sandbox deadline reached"}
          </span>
          {total > 0 && (
            <span className="text-ink-4 font-mono text-[11px]">
              {formatRemainingShort(total - remaining)} / {formatRemainingShort(total)}
            </span>
          )}
        </div>
        {total > 0 && (
          <div className="bg-muted mt-1.5 h-1 w-full overflow-hidden rounded">
            <div
              className={cn(
                "h-full transition-all",
                isCritical
                  ? "bg-err"
                  : isLow
                    ? "bg-warn"
                    : "bg-foreground/40",
              )}
              style={{ width: `${elapsedPct}%` }}
            />
          </div>
        )}
      </div>
      <Button
        variant={isLow ? "accent" : "ghost"}
        size="sm"
        disabled={extend.loading}
        onClick={() => handleExtend(180)}
      >
        <RefreshCwIcon className="size-[12px]" />
        {extend.loading ? "Extending…" : "+3 min"}
      </Button>
    </div>
  )
}

function formatRemainingShort(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const r = s % 60
  if (r === 0) return `${m}m`
  return `${m}m ${r}s`
}

/* ────────────────────────────  Scripts panel  ──────────────────────── */

function ScriptsPanel({ runId }: { runId: string }) {
  const bundleQ = useFetch(
    useCallback(() => getLatestScriptBundle(runId), [runId]),
    [runId],
  )
  const generate = useMutation(
    useCallback(async () => generateTestScripts(runId), [runId]),
  )

  const bundle: TestScriptBundle | undefined = bundleQ.data ?? undefined
  const isLive =
    bundle?.status === "pending" || bundle?.status === "running"

  // Poll while a bundle is still being generated.
  useEffect(() => {
    if (!isLive) return
    const t = setInterval(() => {
      void bundleQ.mutate()
    }, 3_000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLive, bundleQ.mutate])

  const handleGenerate = async () => {
    try {
      await generate.run()
      toast.success("Generating test scripts…")
      await bundleQ.mutate()
    } catch (e) {
      toast.error(
        `Could not start: ${e instanceof Error ? e.message : String(e)}`,
      )
    }
  }

  if (bundleQ.error) {
    return (
      <div className="text-err-ink text-[12.5px]">
        {bundleQ.error.message}
      </div>
    )
  }

  if (bundleQ.loading && !bundle) {
    return <div className="text-ink-3 text-[13px]">Loading…</div>
  }

  if (!bundle) {
    return (
      <Section title="Test scripts">
        <div className="border-border bg-card flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
          <div className="bg-muted text-ink-3 grid size-12 place-items-center rounded-full">
            <Code2Icon className="size-[20px]" />
          </div>
          <div className="mt-3 text-[16px] font-medium">
            No test scripts yet
          </div>
          <p className="text-ink-3 mt-1 max-w-[480px] text-center text-[13px]">
            Once you&apos;re happy with the test cases, generate a runnable
            test-script bundle from the approved cases. The agent picks the
            framework and gives you a single <code className="bg-muted rounded px-1 py-0.5 font-mono text-[11px]">run.sh</code> entrypoint.
          </p>
          <Button
            variant="accent"
            className="mt-5"
            onClick={handleGenerate}
            disabled={generate.loading}
          >
            <Code2Icon className="size-[13px]" />
            {generate.loading ? "Starting…" : "Generate test scripts"}
          </Button>
        </div>
      </Section>
    )
  }

  if (bundle.status === "pending" || bundle.status === "running") {
    return (
      <Section title="Test scripts">
        <div className="border-border bg-card rounded-lg border p-5">
          <div className="flex items-center gap-3">
            <span className="bg-accent-soft text-accent-ink inline-flex size-8 items-center justify-center rounded-md">
              <Code2Icon className="size-[15px]" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-medium">
                Generating test scripts (v{bundle.version})…
              </div>
              <div className="text-ink-3 text-[12.5px]">
                The agent is authoring tests in a sandbox. This usually
                takes 2–5 minutes.
              </div>
            </div>
            <Badge
              variant="accent"
              className="gap-1.5"
            >
              <span className="bg-accent-ink size-1.5 animate-pulse rounded-full" />
              {bundle.status}
            </Badge>
          </div>
          <div className="bg-muted mt-4 h-1 w-full overflow-hidden rounded">
            <div className="bg-foreground/40 h-full w-1/3 animate-pulse" />
          </div>
        </div>
      </Section>
    )
  }

  if (bundle.status === "failed") {
    return (
      <Section title="Test scripts">
        <div className="border-err/40 bg-err-soft/30 rounded-lg border p-5">
          <div className="flex items-center gap-2">
            <AlertTriangleIcon className="text-err-ink size-[14px]" />
            <span className="text-err-ink text-[14px] font-medium">
              Generation failed
            </span>
          </div>
          {bundle.error && (
            <pre className="text-err-ink mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-[11.5px]">
              {bundle.error}
            </pre>
          )}
          <Button
            variant="accent"
            className="mt-4"
            onClick={handleGenerate}
            disabled={generate.loading}
          >
            <RotateCcwIcon className="size-[13px]" />
            {generate.loading ? "Starting…" : "Try again"}
          </Button>
        </div>
      </Section>
    )
  }

  // bundle.status === "succeeded"
  return (
    <SucceededBundle
      runId={runId}
      bundle={bundle}
      onRegenerate={handleGenerate}
      regenerating={generate.loading}
    />
  )
}

function SucceededBundle({
  runId,
  bundle,
  onRegenerate,
  regenerating,
}: {
  runId: string
  bundle: TestScriptBundle
  onRegenerate: () => void
  regenerating: boolean
}) {
  return (
    <div className="space-y-5">
      <div className="border-border bg-card rounded-lg border p-5">
        <div className="flex items-center gap-3">
          <span className="bg-ok-soft text-ok-ink inline-flex size-8 items-center justify-center rounded-md">
            <CheckIcon className="size-[16px]" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-medium">
              Bundle ready · v{bundle.version}
            </div>
            <div className="text-ink-3 text-[12.5px]">
              {bundle.framework ?? "framework: ?"} ·{" "}
              {bundle.language ?? "language: ?"} ·{" "}
              {bundle.test_count ?? "?"} test
              {bundle.test_count === 1 ? "" : "s"}
            </div>
          </div>
          <a
            href={scriptBundleDownloadUrl(runId)}
            className="border-border bg-card hover:bg-muted text-foreground inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[12.5px] font-medium"
          >
            <DownloadIcon className="size-[13px]" />
            Download bundle
          </a>
          <Button
            variant="ghost"
            size="sm"
            onClick={onRegenerate}
            disabled={regenerating}
          >
            <RotateCcwIcon className="size-[13px]" />
            {regenerating ? "Starting…" : "Generate again"}
          </Button>
        </div>

        <div className="text-ink-3 mt-3 text-[12.5px]">
          The bundle has a single entrypoint. To run it locally:
        </div>
        <pre className="bg-muted mt-2 overflow-x-auto rounded-md p-3 font-mono text-[12px]">
{`unzip bundle-run-${runId.slice(0, 8)}.zip -d bundle && cd bundle
bash run.sh
# JUnit report → reports/junit.xml
# Summary     → reports/summary.json`}
        </pre>
      </div>

      <BundleFiles runId={runId} />

      {bundle.manifest && (
        <Section title="Manifest">
          <pre className="border-border bg-card max-h-[280px] overflow-auto rounded-md border p-3 font-mono text-[12px]">
            {JSON.stringify(bundle.manifest, null, 2)}
          </pre>
        </Section>
      )}
    </div>
  )
}

function BundleFiles({ runId }: { runId: string }) {
  const filesQ = useFetch(
    useCallback(() => listScriptBundleFiles(runId), [runId]),
    [runId],
  )
  const [selected, setSelected] = useState<string | null>(null)

  const files = filesQ.data?.files ?? []
  const sortedFiles = useMemo(
    () =>
      [...files].sort((a, b) => {
        // Surface run.sh, manifest.json, README.md at the top.
        const score = (p: string) => {
          if (p.endsWith("/run.sh")) return 0
          if (p.endsWith("/manifest.json")) return 1
          if (p.toUpperCase().endsWith("/README.MD")) return 2
          return 3
        }
        const sa = score(a.path)
        const sb = score(b.path)
        if (sa !== sb) return sa - sb
        return a.path.localeCompare(b.path)
      }),
    [files],
  )

  // Pick a sensible default when the file list arrives.
  useEffect(() => {
    if (selected || sortedFiles.length === 0) return
    const runSh = sortedFiles.find((f) => f.path.endsWith("/run.sh"))
    setSelected((runSh ?? sortedFiles[0]!).path)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedFiles])

  if (filesQ.error) {
    return (
      <Section title="Files">
        <div className="text-err-ink text-[12.5px]">
          {filesQ.error.message}
        </div>
      </Section>
    )
  }
  if (filesQ.loading && files.length === 0) {
    return (
      <Section title="Files">
        <div className="text-ink-3 text-[12.5px]">Loading file tree…</div>
      </Section>
    )
  }
  if (files.length === 0) {
    return (
      <Section title="Files">
        <div className="text-ink-3 text-[12.5px]">
          No files in the bundle.
        </div>
      </Section>
    )
  }

  return (
    <Section title="Files">
      <div className="border-border bg-card grid grid-cols-[260px_minmax(0,1fr)] overflow-hidden rounded-lg border">
        <div className="border-border max-h-[480px] overflow-auto border-r p-2">
          {sortedFiles.map((f) => {
            const display = f.path.replace(/^output\/workspace\//, "")
            const active = selected === f.path
            return (
              <button
                type="button"
                key={f.path}
                onClick={() => setSelected(f.path)}
                className={cn(
                  "flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-[12.5px]",
                  active
                    ? "bg-foreground/10 text-foreground"
                    : "text-ink-2 hover:bg-muted",
                )}
                title={display}
              >
                <FileTextIcon className="text-ink-4 size-[12px] shrink-0" />
                <span className="truncate">{display}</span>
                <span className="text-ink-4 ml-auto font-mono text-[10px]">
                  {f.size}
                </span>
              </button>
            )
          })}
        </div>
        <div className="bg-background min-w-0">
          {selected ? (
            <FileViewer runId={runId} path={selected} />
          ) : (
            <div className="text-ink-3 p-4 text-[12.5px]">
              Pick a file to preview.
            </div>
          )}
        </div>
      </div>
    </Section>
  )
}

function FileViewer({ runId, path }: { runId: string; path: string }) {
  const fileQ = useFetch(
    useCallback(() => readScriptBundleFile(runId, path), [runId, path]),
    [runId, path],
  )

  if (fileQ.loading) {
    return (
      <div className="text-ink-3 p-4 text-[12.5px]">Loading {path}…</div>
    )
  }
  if (fileQ.error) {
    return (
      <div className="text-err-ink p-4 text-[12.5px]">{fileQ.error.message}</div>
    )
  }
  return (
    <pre className="max-h-[480px] overflow-auto p-4 font-mono text-[12px] leading-relaxed whitespace-pre-wrap">
      {fileQ.data ?? ""}
    </pre>
  )
}

// ── Test results (Agent 4 -> execution) ────────────────────────────────────

function TestResultsPanel({ runId }: { runId: string }) {
  // We fetch *list* + *latest* together. The list powers the history
  // strip; latest is what the hero summary + per-test list show.
  const listQ = useFetch(
    useCallback(() => listTestExecutions(runId), [runId]),
    [runId],
  )
  const latestId = listQ.data?.[0]?.id

  const detailQ = useFetch(
    useCallback(
      async () => (latestId ? getTestExecution(latestId) : null),
      [latestId],
    ),
    [latestId],
  )

  const trigger = useMutation(
    useCallback(async () => createTestExecution(runId), [runId]),
  )

  const latest: TestExecutionDetail | null = detailQ.data ?? null

  const cancelMut = useMutation(
    useCallback(
      async () => {
        const id = detailQ.data?.id
        if (!id) throw new Error("no execution to cancel")
        return cancelTestExecution(id)
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [detailQ.data?.id],
    ),
  )

  // Poll while the most recent execution is still in flight.
  const isLive =
    latest?.status === "queued" || latest?.status === "running"
  useEffect(() => {
    if (!isLive) return
    const t = setInterval(() => {
      void listQ.mutate()
      void detailQ.mutate()
    }, 3_000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLive, listQ.mutate, detailQ.mutate])

  const handleRunAgain = async () => {
    try {
      await trigger.run()
      toast.success("Queued a test execution.")
      await listQ.mutate()
      await detailQ.mutate()
    } catch (e) {
      toast.error(
        `Could not run tests: ${e instanceof Error ? e.message : String(e)}`,
      )
    }
  }

  const handleCancel = async () => {
    try {
      await cancelMut.run()
      toast.success("Execution cancelled.")
      await listQ.mutate()
      await detailQ.mutate()
    } catch (e) {
      toast.error(
        `Could not cancel: ${e instanceof Error ? e.message : String(e)}`,
      )
    }
  }

  if (listQ.error) {
    return (
      <div className="text-err-ink text-[12.5px]">{listQ.error.message}</div>
    )
  }

  if (listQ.loading && !listQ.data) {
    return <div className="text-ink-3 text-[13px]">Loading…</div>
  }

  // Empty: no executions yet (rare in practice because we auto-run,
  // but possible if Agent 4 just finished and the worker hasn't
  // queued the auto-execution yet, or the user disabled auto-run).
  if (!listQ.data || listQ.data.length === 0) {
    return (
      <Section title="Test results">
        <div className="border-border bg-card flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
          <div className="bg-muted text-ink-3 grid size-12 place-items-center rounded-full">
            <PlayIcon className="size-[20px]" />
          </div>
          <div className="mt-3 text-[16px] font-medium">
            No test runs yet
          </div>
          <p className="text-ink-3 mt-1 max-w-[480px] text-center text-[13px]">
            Run the generated test bundle to see results here. Each run
            spins up its own sandbox container, captures pass/fail
            counts, and stores screenshots for any failures.
          </p>
          <Button
            variant="accent"
            className="mt-5"
            onClick={handleRunAgain}
            disabled={trigger.loading}
          >
            <PlayIcon className="size-[13px]" />
            {trigger.loading ? "Queuing…" : "Run tests"}
          </Button>
        </div>
      </Section>
    )
  }

  return (
    <div className="space-y-5">
      <ExecutionHero
        execution={latest}
        loadingDetail={detailQ.loading && !latest}
        onRunAgain={handleRunAgain}
        runAgainLoading={trigger.loading}
        onCancel={handleCancel}
        cancelLoading={cancelMut.loading}
      />

      {latest && latest.status === "errored" && latest.error && (
        <div className="border-err/40 bg-err-soft text-err-ink rounded-md border p-3 text-[12.5px]">
          {latest.error}
        </div>
      )}

      {latest && latest.results && latest.results.length > 0 && (
        <ExecutionResultsList
          executionId={latest.id}
          results={latest.results}
        />
      )}

      {listQ.data.length > 1 && (
        <ExecutionHistoryStrip
          executions={listQ.data}
          activeId={latest?.id}
        />
      )}
    </div>
  )
}

function ExecutionHero({
  execution,
  loadingDetail,
  onRunAgain,
  runAgainLoading,
  onCancel,
  cancelLoading,
}: {
  execution: TestExecutionDetail | null
  loadingDetail: boolean
  onRunAgain: () => void
  runAgainLoading: boolean
  onCancel: () => void
  cancelLoading: boolean
}) {
  if (!execution) {
    return (
      <div className="border-border bg-card rounded-lg border p-5">
        <div className="text-ink-3 text-[13px]">
          {loadingDetail ? "Loading the latest execution…" : "No detail yet."}
        </div>
      </div>
    )
  }

  const summary = (execution.summary ?? {}) as Record<string, unknown>
  const total = Number(summary.total ?? 0)
  const passed = Number(summary.passed ?? 0)
  const failed = Number(summary.failed ?? 0)
  const skipped = Number(summary.skipped ?? 0)
  const errored = Number(summary.errored ?? 0)
  const isLive =
    execution.status === "queued" || execution.status === "running"

  return (
    <div className="border-border bg-card rounded-lg border p-5">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1">
          <div className="text-ink-3 text-[11px] font-medium tracking-wide uppercase">
            Latest execution
          </div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <ExecutionVerdict status={execution.status} />
            {execution.duration_ms != null && (
              <span className="text-ink-4 font-mono text-[12px]">
                {formatDuration(execution.duration_ms)}
              </span>
            )}
            <span className="text-ink-4 text-[12px]">
              <RelativeTime iso={execution.created_at} />
            </span>
            {execution.trigger === "auto" && (
              <span className="text-ink-4 text-[11px]">auto</span>
            )}
          </div>
          {total > 0 && (
            <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-4">
              <CountTile label="Passed" value={passed} tone="ok" />
              <CountTile label="Failed" value={failed} tone="err" />
              <CountTile label="Skipped" value={skipped} tone="muted" />
              <CountTile label="Errored" value={errored} tone="warn" />
            </div>
          )}
          {isLive && total === 0 && (
            <div className="text-ink-3 mt-3 text-[12.5px]">
              Tests are still being prepared in the sandbox.
            </div>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {isLive && (
            <Button
              variant="ghost"
              size="sm"
              disabled={cancelLoading}
              onClick={onCancel}
            >
              {cancelLoading ? "Cancelling…" : "Cancel"}
            </Button>
          )}
          <Button
            variant="accent"
            size="sm"
            disabled={runAgainLoading || isLive}
            onClick={onRunAgain}
          >
            <PlayIcon className="size-[13px]" />
            {runAgainLoading
              ? "Queuing…"
              : isLive
                ? "Running…"
                : "Run again"}
          </Button>
        </div>
      </div>
    </div>
  )
}

function ExecutionVerdict({ status }: { status: string }) {
  const tone =
    status === "passed"
      ? "ok"
      : status === "failed"
        ? "err"
        : status === "errored"
          ? "warn"
          : status === "running" || status === "queued"
            ? "accent"
            : "muted"
  const label =
    status === "passed"
      ? "All tests passed"
      : status === "failed"
        ? "Some tests failed"
        : status === "errored"
          ? "Could not finish"
          : status === "running"
            ? "Running"
            : status === "queued"
              ? "Queued"
              : status
  return (
    <Badge variant={tone === "muted" ? "muted" : tone} className="gap-1.5">
      <span
        className={cn(
          "size-1.5 rounded-full",
          tone === "ok" && "bg-ok-ink",
          tone === "err" && "bg-err-ink",
          tone === "warn" && "bg-warn-ink",
          tone === "accent" && "bg-accent-ink animate-pulse",
          tone === "muted" && "bg-ink-4",
        )}
      />
      {label}
    </Badge>
  )
}

function CountTile({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: "ok" | "err" | "warn" | "muted"
}) {
  return (
    <div>
      <div
        className={cn(
          "text-[24px] leading-none font-semibold tracking-[-0.02em]",
          tone === "ok" && value > 0 && "text-ok-ink",
          tone === "err" && value > 0 && "text-err-ink",
          tone === "warn" && value > 0 && "text-warn-ink",
          (tone === "muted" || value === 0) && "text-ink-4",
        )}
      >
        {value}
      </div>
      <div className="text-ink-3 mt-1 text-[11px] tracking-wide uppercase">
        {label}
      </div>
    </div>
  )
}

function ExecutionResultsList({
  executionId,
  results,
}: {
  executionId: string
  results: TestExecutionResult[]
}) {
  // Group: failed first, then errored, then passed, then skipped. People
  // overwhelmingly want to see what broke.
  const ordered = useMemo(() => {
    const order: Record<string, number> = {
      failed: 0,
      errored: 1,
      passed: 2,
      skipped: 3,
    }
    return [...results].sort(
      (a, b) => (order[a.outcome] ?? 99) - (order[b.outcome] ?? 99),
    )
  }, [results])

  return (
    <Section title={`Per test (${results.length})`}>
      <div className="border-border bg-card divide-border divide-y rounded-lg border">
        {ordered.map((r) => (
          <ResultRow key={r.id} result={r} executionId={executionId} />
        ))}
      </div>
    </Section>
  )
}

function ResultRow({
  result,
  executionId,
}: {
  result: TestExecutionResult
  executionId: string
}) {
  const [open, setOpen] = useState(false)
  const hasDetails =
    !!result.failure_message ||
    !!result.failure_trace ||
    !!result.screenshot_path
  const dot =
    result.outcome === "passed"
      ? "bg-ok-ink"
      : result.outcome === "failed"
        ? "bg-err-ink"
        : result.outcome === "errored"
          ? "bg-warn-ink"
          : "bg-ink-4"

  return (
    <div className="px-4 py-3">
      <button
        type="button"
        onClick={() => hasDetails && setOpen((o) => !o)}
        className={cn(
          "flex w-full items-center gap-3 text-left",
          hasDetails && "cursor-pointer",
        )}
        disabled={!hasDetails}
        aria-expanded={open}
      >
        <span
          aria-hidden
          className={cn("size-1.5 shrink-0 rounded-full", dot)}
        />
        <span className="min-w-0 flex-1 truncate font-mono text-[12.5px]">
          {result.test_id}
        </span>
        {result.duration_ms != null && (
          <span className="text-ink-4 shrink-0 font-mono text-[11px]">
            {formatDuration(result.duration_ms)}
          </span>
        )}
        <span
          className={cn(
            "shrink-0 rounded-[3px] px-1.5 py-px text-[10.5px] font-medium",
            result.outcome === "passed" && "bg-ok-soft text-ok-ink",
            result.outcome === "failed" && "bg-err-soft text-err-ink",
            result.outcome === "errored" && "bg-warn-soft text-warn-ink",
            result.outcome === "skipped" && "bg-muted text-ink-3",
          )}
        >
          {result.outcome}
        </span>
        {hasDetails && (
          <ChevronDownIcon
            className={cn(
              "text-ink-4 size-[13px] shrink-0 transition-transform",
              open && "rotate-180",
            )}
          />
        )}
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          {result.failure_message && (
            <div className="text-err-ink text-[12.5px] font-medium">
              {result.failure_message}
            </div>
          )}
          {result.failure_trace && (
            <pre className="border-border bg-muted text-ink-2 max-h-[280px] overflow-auto rounded-md border p-3 font-mono text-[11.5px] leading-snug whitespace-pre-wrap">
              {result.failure_trace}
            </pre>
          )}
          {result.screenshot_path && (
            <a
              href={executionArtifactUrl(executionId, result.screenshot_path)}
              target="_blank"
              rel="noreferrer"
              className="block"
            >
              <img
                src={executionArtifactUrl(
                  executionId,
                  result.screenshot_path,
                )}
                alt="Failure screenshot"
                className="border-border max-h-[360px] w-full max-w-[600px] rounded-md border object-contain"
              />
            </a>
          )}
        </div>
      )}
    </div>
  )
}

function ExecutionHistoryStrip({
  executions,
  activeId,
}: {
  executions: TestExecution[]
  activeId: string | undefined
}) {
  // Show up to 8 most recent. Oldest on the left so the strip reads
  // left-to-right like a sparkline of bundle health over time.
  const recent = executions.slice(0, 8).slice().reverse()
  return (
    <Section title="Recent runs">
      <div className="flex flex-wrap items-center gap-2">
        {recent.map((e) => {
          const tone =
            e.status === "passed"
              ? "bg-ok-ink"
              : e.status === "failed"
                ? "bg-err-ink"
                : e.status === "errored"
                  ? "bg-warn-ink"
                  : "bg-ink-4"
          const isActive = e.id === activeId
          return (
            <div
              key={e.id}
              title={`${e.status} · ${formatAbsolute(e.created_at)}`}
              className={cn(
                "flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px]",
                isActive
                  ? "border-foreground bg-card"
                  : "border-border bg-card text-ink-3",
              )}
            >
              <span
                aria-hidden
                className={cn("size-1.5 rounded-full", tone)}
              />
              <span className="font-mono">#{e.id.slice(0, 6)}</span>
            </div>
          )
        })}
      </div>
    </Section>
  )
}
