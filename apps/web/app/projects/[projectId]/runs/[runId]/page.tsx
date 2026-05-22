"use client"

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  AlertTriangleIcon,
  CheckIcon,
  RefreshCwIcon,
  SendIcon,
} from "lucide-react"
import { toast } from "sonner"

import { CapLine } from "@/components/probe/cap-line"
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
  getFeatureExpectation,
  getProject,
  getRun,
  getTestCases,
  getTestScenario,
  runEventsUrl,
  submitFeedback,
  useFetch,
  useMutation,
  type FeatureExpectation,
  type Run,
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

  // Initial run fetch + then poll every 4s as a safety net (SSE handles
  // most updates, but the run row's status changes between events)
  useEffect(() => {
    void refreshRun()
    const t = setInterval(() => {
      if (run && TERMINAL_STATUSES.has(run.status)) return
      void refreshRun().catch(() => undefined)
    }, 4_000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshRun, run?.status])

  // Test scenario for breadcrumb context
  const scenarioQ = useFetch(
    useCallback(
      async () =>
        run?.test_scenario_id ? getTestScenario(run.test_scenario_id) : null,
      [run?.test_scenario_id],
    ),
    [run?.test_scenario_id],
  )

  const project = projectQ.data
  const scenario = scenarioQ.data

  useSetBreadcrumbs(
    project
      ? [
          { label: "Projects", href: "/projects" },
          { label: project.name, href: `/projects/${project.id}` },
          {
            label: "Test sets",
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
          { label: runId.slice(0, 8), mono: true },
        ]
      : [{ label: "Projects", href: "/projects" }],
    "run",
  )

  // ── SSE: live event tail ─────────────────────────────────────────────────

  const [events, setEvents] = useState<SseEvent[]>([])
  const eventIdsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    eventIdsRef.current = new Set()
    setEvents([])

    const url = runEventsUrl(runId)
    const es = new EventSource(url)

    const onMessage = (kind: string) => (e: MessageEvent) => {
      try {
        const parsed = JSON.parse(e.data) as Record<string, unknown>
        const id = typeof parsed.id === "string" ? parsed.id : `${Date.now()}`
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
    types.forEach((t) => es.addEventListener(t, onMessage(t)))

    es.onerror = () => {
      // Browser will retry automatically; no-op.
    }

    return () => {
      es.close()
    }
  }, [runId, refreshRun])

  // ── Conditional sub-fetches based on run status ─────────────────────────

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

  // ── Feedback submission ─────────────────────────────────────────────────

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
      toast.error("Please provide feedback when requesting a revision.")
      return
    }
    try {
      await feedback.run(decision)
      toast.success(decision === "approve" ? "Approved" : "Revision requested")
      setFeedbackText("")
      await refreshRun()
    } catch (e) {
      toast.error(`Feedback failed: ${e instanceof Error ? e.message : e}`)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────

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
    <div className="grid h-full grid-cols-[420px_minmax(0,1fr)] overflow-hidden">
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
          fe={feQ.data ?? undefined}
          cases={casesQ.data ?? []}
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
  return (
    <div className="px-5 py-5">
      <div className="border-border bg-card mb-5 space-y-1.5 rounded-lg border p-4">
        <Row label="Run">
          <span className="font-mono">{runId.slice(0, 8)}</span>
          <span className="ml-auto">
            <RunStatusBadge status={status} />
          </span>
        </Row>
        <Row label="Node">
          <span className="font-mono">{run?.current_node ?? "—"}</span>
        </Row>
        <Row label="Created">
          <span className="font-mono">
            {run ? new Date(run.created_at).toLocaleString() : "—"}
          </span>
        </Row>
        {run?.error && (
          <div className="border-err/40 bg-err-soft text-err-ink mt-2 rounded-md border p-2 text-[12px]">
            {run.error}
          </div>
        )}
        {runError && (
          <div className="border-err/40 bg-err-soft text-err-ink mt-2 rounded-md border p-2 text-[12px]">
            Failed to load run: {runError.message}
          </div>
        )}
      </div>

      <div className="mb-3 flex items-center justify-between">
        <CapLine>orchestration timeline</CapLine>
        <Button variant="ghost" size="sm" onClick={() => void onRefresh()}>
          <RefreshCwIcon className="size-[12px]" />
          Refresh
        </Button>
      </div>

      <div className="space-y-1.5">
        {events.length === 0 ? (
          <div className="text-ink-3 px-1 text-[12.5px]">
            Waiting for events…
          </div>
        ) : (
          events.map((e) => <EventRow key={e.id} e={e} />)
        )}
      </div>
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

function RunStatusBadge({ status }: { status: string }) {
  const variant =
    status === "completed"
      ? "ok"
      : status === "failed"
        ? "err"
        : status.endsWith("_review")
          ? "warn"
          : "accent"
  const dotKind: "running" | "done" | "err" | "wait" =
    status === "completed"
      ? "done"
      : status === "failed"
        ? "err"
        : status.endsWith("_review")
          ? "wait"
          : "running"
  return (
    <Badge variant={variant} className="gap-1.5">
      <StatusDot kind={dotKind} size={6} />
      {status.replace(/_/g, " ")}
    </Badge>
  )
}

function EventRow({ e }: { e: SseEvent }) {
  const time = new Date(e.created_at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
  const tone =
    e.type === "error" || e.type === "sandbox_task_failed"
      ? "border-err/40 bg-err-soft/40"
      : e.type === "interrupt"
        ? "border-warn/40 bg-warn-soft/40"
        : e.type === "node_end" ||
            e.type === "workflow_completed" ||
            e.type === "sandbox_task_completed" ||
            e.type === "feedback_received"
          ? "border-ok/30 bg-ok-soft/30"
          : "border-border bg-card"
  return (
    <div className={cn("rounded-md border px-3 py-2 text-[12.5px]", tone)}>
      <div className="flex items-center gap-2">
        <span className="bg-muted text-ink-3 rounded-[3px] px-1.5 py-px font-mono text-[10.5px]">
          {e.type}
        </span>
        <span className="text-ink-3 font-mono text-[11px]">{e.node_name}</span>
        <span className="text-ink-4 ml-auto font-mono text-[10.5px]">
          {time}
        </span>
      </div>
      {e.payload != null && (
        <pre className="text-ink-2 mt-1.5 overflow-x-auto whitespace-pre-wrap font-mono text-[11px] leading-snug">
          {typeof e.payload === "string"
            ? e.payload
            : JSON.stringify(e.payload, null, 0)}
        </pre>
      )}
    </div>
  )
}

/* ────────────────────────────  Right panel  ──────────────────────────── */

function RightPanel({
  run,
  fe,
  cases,
  feedbackText,
  onFeedbackTextChange,
  onSubmit,
  submitting,
}: {
  run: Run | undefined
  fe: FeatureExpectation | undefined
  cases: TestCase[]
  feedbackText: string
  onFeedbackTextChange: (s: string) => void
  onSubmit: (decision: "approve" | "revise") => void
  submitting: boolean
}) {
  const status = run?.status ?? "pending"
  const showReviewBar = status === "agent1_review" || status === "agent3_review"

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-border flex items-center gap-3 border-b px-6 py-3.5">
        <div className="text-[14px] font-medium">
          {status === "agent1_review"
            ? "Review feature expectation"
            : status === "agent3_review"
              ? "Review test cases"
              : status === "completed"
                ? "Run completed"
                : status === "failed"
                  ? "Run failed"
                  : "Run in progress"}
        </div>
        <span className="text-ink-3 text-[12px]">
          {run?.current_node ?? ""}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <Tabs
          defaultValue={status === "agent3_review" ? "cases" : "spec"}
          className="flex min-h-0 flex-1 flex-col"
        >
          <TabsList className="border-border h-auto justify-start gap-1 rounded-none border-b bg-transparent px-6 py-0">
            <Tab value="spec">Feature spec {fe ? `· v${fe.version}` : ""}</Tab>
            <Tab value="cases">
              Test cases
              {cases.length > 0 && (
                <span className="bg-muted text-ink-3 ml-1.5 rounded-[3px] px-1.5 py-px font-mono text-[10px]">
                  {cases.length}
                </span>
              )}
            </Tab>
          </TabsList>

          <TabsContent value="spec" className="px-6 py-5">
            {fe ? (
              <FeaturePanel fe={fe} />
            ) : (
              <div className="text-ink-3 text-[13px]">
                {showReviewBar
                  ? "Loading feature expectation…"
                  : "The feature expectation will appear here once Agent 1 finishes."}
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
                  : "Test cases will appear once Agent 3 produces them."}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {showReviewBar && (
        <div className="border-warn/40 bg-warn-soft/40 space-y-2 border-t px-6 py-3.5">
          <div className="text-warn-ink flex items-center gap-1.5 text-[12px] font-medium">
            <AlertTriangleIcon className="size-[12px]" />
            Human review required · run is paused on this node
          </div>
          <Textarea
            placeholder={
              status === "agent1_review"
                ? "Optional feedback for Agent 1 — required if you choose 'Revise'."
                : "Optional feedback for Agent 3 — required if you choose 'Revise'."
            }
            value={feedbackText}
            onChange={(e) => onFeedbackTextChange(e.target.value)}
            className="min-h-[60px] resize-none text-[13px]"
          />
          <div className="flex items-center gap-2">
            <span className="text-ink-4 text-[11px]">
              ⌘↵ to accept · esc to discard edits
            </span>
            <div className="ml-auto flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={submitting}
                onClick={() => onSubmit("revise")}
              >
                <SendIcon className="size-[13px]" />
                Send revision
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

/* ────────────────────────  FE & cases panels  ──────────────────────── */

function FeaturePanel({ fe }: { fe: FeatureExpectation }) {
  const c = (fe.content ?? {}) as Record<string, unknown>
  return (
    <div className="max-w-[820px] space-y-5">
      <div>
        <Badge variant={fe.status === "approved" ? "ok" : "muted"}>
          {fe.status} · v{fe.version}
        </Badge>
      </div>
      {typeof c.feature_overview === "string" && (
        <Section title="Feature overview">
          <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed">
            {c.feature_overview}
          </p>
        </Section>
      )}
      {Array.isArray(c.user_flows) && c.user_flows.length > 0 && (
        <Section title="User flows">
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
        <Section title="Data contracts">
          <pre className="bg-muted whitespace-pre-wrap rounded-md p-3 font-mono text-[12px] leading-snug">
            {c.data_contracts}
          </pre>
        </Section>
      )}
      {Array.isArray(c.edge_cases) && (
        <Section title="Edge cases">
          <ul className="list-disc space-y-1 pl-5 text-[13.5px]">
            {(c.edge_cases as unknown[]).map((s, i) => (
              <li key={i}>{String(s)}</li>
            ))}
          </ul>
        </Section>
      )}
      {Array.isArray(c.expanded_acceptance_criteria) && (
        <Section title="Acceptance criteria">
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
        <Section title="Dependencies & assumptions">
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
              <h3 className="text-[15px] font-semibold capitalize">{kind}</h3>
              <Badge variant="muted">{items.length}</Badge>
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
                      {tc.status}
                    </Badge>
                  </div>
                  <p className="text-ink-3 mt-1 text-[12.5px]">
                    {tc.description}
                  </p>
                  {tc.preconditions && (
                    <div className="text-ink-4 mt-1 text-[12px]">
                      Preconditions: {tc.preconditions}
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
                      Rationale: {tc.rationale}
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
