/**
 * Plain-English label helpers. Keeps every user-facing string in one place
 * so we don't leak internal node/event identifiers into the UI.
 */
import type { RunStatus, TestScenarioStatus } from "@/lib/api"

// ── Run status ──────────────────────────────────────────────────────────────

const RUN_STATUS_LABEL: Record<RunStatus, string> = {
  pending: "Queued",
  agent1_running: "Brief Author drafting",
  agent1_review: "Brief Author awaiting review",
  agent2_running: "Sandbox Explorer exploring",
  agent3_running: "Test Designer planning",
  agent3_review: "Test Designer awaiting review",
  completed: "Completed",
  failed: "Failed",
}

export type StatusTone = "ok" | "warn" | "err" | "accent" | "muted"

const RUN_STATUS_TONE: Record<RunStatus, StatusTone> = {
  pending: "muted",
  agent1_running: "accent",
  agent1_review: "warn",
  agent2_running: "accent",
  agent3_running: "accent",
  agent3_review: "warn",
  completed: "ok",
  failed: "err",
}

export function runStatusLabel(status: RunStatus | string): string {
  return (RUN_STATUS_LABEL as Record<string, string>)[status] ?? status
}

export function runStatusTone(status: RunStatus | string): StatusTone {
  return (RUN_STATUS_TONE as Record<string, StatusTone>)[status] ?? "muted"
}

export type DotKind = "running" | "done" | "err" | "wait"

export function runStatusDot(status: RunStatus | string): DotKind {
  if (status === "completed") return "done"
  if (status === "failed") return "err"
  if (typeof status === "string" && status.endsWith("_review")) return "wait"
  if (status === "pending") return "wait"
  return "running"
}

// ── Node names ──────────────────────────────────────────────────────────────

const NODE_LABEL: Record<string, string> = {
  load_project_context: "Loading context",
  agent_1_generate: "Brief Author",
  human_review_1: "Brief review",
  agent_2_placeholder: "Sandbox Explorer",
  agent_3_generate: "Test Designer",
  human_review_3: "Test-case review",
  persist_results: "Saving results",
  script_generation: "Script Builder",
  test_execution: "Test runner",
}

const NODE_PHASE: Record<string, string> = {
  load_project_context: "Setup",
  agent_1_generate: "Brief",
  human_review_1: "Brief",
  agent_2_placeholder: "Sandbox",
  agent_3_generate: "Test cases",
  human_review_3: "Test cases",
  persist_results: "Saving",
  script_generation: "Scripts",
  test_execution: "Test runs",
}

/**
 * Display order used by the timeline so cards render in a stable sequence
 * even when their first events arrive out of order.
 */
export const NODE_ORDER = [
  "load_project_context",
  "agent_1_generate",
  "human_review_1",
  "agent_2_placeholder",
  "agent_3_generate",
  "human_review_3",
  "persist_results",
] as const

export function nodeLabel(nodeName: string): string {
  return NODE_LABEL[nodeName] ?? nodeName
}

export function nodePhase(nodeName: string): string {
  return NODE_PHASE[nodeName] ?? "Other"
}

export function nodeOrderIndex(nodeName: string): number {
  const i = (NODE_ORDER as readonly string[]).indexOf(nodeName)
  return i < 0 ? 999 : i
}

// ── Run-status -> phase title (for the right-panel header) ───────────────────

export function runPhaseTitle(status: RunStatus | string): string {
  switch (status) {
    case "pending":
      return "Run queued"
    case "agent1_running":
      return "Brief Author at work"
    case "agent1_review":
      return "Review the brief"
    case "agent2_running":
      return "Sandbox Explorer at work"
    case "agent3_running":
      return "Test Designer at work"
    case "agent3_review":
      return "Review the test cases"
    case "completed":
      return "Run completed"
    case "failed":
      return "Run failed"
    default:
      return "Run in progress"
  }
}

// ── SSE event types ─────────────────────────────────────────────────────────

const EVENT_LABEL: Record<string, string> = {
  node_start: "Started",
  node_end: "Finished",
  interrupt: "Awaiting your review",
  feedback_received: "Review submitted",
  sandbox_task_created: "Sandbox started",
  sandbox_task_progress: "Sandbox progress",
  sandbox_task_completed: "Sandbox finished",
  sandbox_task_failed: "Sandbox failed",
  sandbox_task_recovered: "Sandbox finished with what it had",
  sandbox_timeout_warning: "Sandbox running low on time",
  sandbox_timeout_extended: "Sandbox got more time",
  workflow_completed: "Run completed",
  script_bundle_started: "Script Builder started",
  script_bundle_progress: "Script Builder progress",
  script_bundle_succeeded: "Test scripts ready",
  script_bundle_failed: "Script Builder failed",
  test_execution_started: "Running tests",
  test_execution_progress: "Test execution progress",
  test_execution_test_outcome: "Test result",
  test_execution_succeeded: "All tests passed",
  test_execution_failed: "Some tests failed",
  test_execution_errored: "Could not run tests",
  error: "Error",
  done: "Stream closed",
}

export function eventLabel(eventType: string): string {
  return EVENT_LABEL[eventType] ?? eventType
}

/**
 * Plain-language one-liner summarising an event's payload, suitable
 * for inline display next to the event label so users don't have to
 * parse JSON to understand what happened.
 *
 * Returns null when the event has nothing useful to say beyond its
 * label (e.g. "Stream closed").
 */
export function eventSummary(
  eventType: string,
  payload: unknown,
): string | null {
  if (payload == null || typeof payload !== "object") return null
  const p = payload as Record<string, unknown>

  switch (eventType) {
    case "node_start": {
      if (p.is_revision === true) return "Revising after feedback"
      return null
    }
    case "node_end": {
      if (typeof p.version === "number") return `Saved as version ${p.version}`
      return null
    }
    case "interrupt": {
      const t = p.type
      if (t === "review_feature_expectation") return "Review the brief"
      if (t === "review_test_cases") return "Review the test cases"
      return null
    }
    case "feedback_received": {
      const dec = String(p.decision ?? "")
      const fb = p.has_feedback === true ? " with notes" : ""
      if (dec === "approve") return `Approved${fb}`
      if (dec === "request_changes" || dec === "reject")
        return `Changes requested${fb}`
      return null
    }
    case "sandbox_task_created": {
      const ts = typeof p.timeout_seconds === "number" ? p.timeout_seconds : null
      return ts ? `Up to ${Math.round(ts / 60)}m to explore` : null
    }
    case "sandbox_task_progress": {
      const s = String(p.status ?? "")
      if (s === "queued") return "Waiting for a runner"
      if (s === "running") return "Exploring the feature"
      if (s === "succeeded") return "Exploration succeeded"
      if (s === "failed") return "Exploration failed"
      return null
    }
    case "sandbox_timeout_extended": {
      const added = typeof p.added_seconds === "number" ? p.added_seconds : null
      return added ? `Added ${Math.round(added / 60)} more minutes` : null
    }
    case "sandbox_task_completed":
    case "sandbox_task_recovered": {
      const files = Array.isArray(p.files) ? p.files.length : null
      const screens = Array.isArray(p.files)
        ? (p.files as string[]).filter((f) => f.includes("screenshots/")).length
        : 0
      if (files == null) return null
      if (screens > 0) {
        return `${files} files captured, ${screens} screenshots`
      }
      return `${files} files captured`
    }
    case "script_bundle_progress": {
      const phase = String(p.phase ?? p.step ?? "")
      if (phase) return phase
      return null
    }
    case "script_bundle_succeeded": {
      const tests = typeof p.test_count === "number" ? p.test_count : null
      return tests != null ? `${tests} tests scripted` : null
    }
    case "test_execution_started": {
      const total = typeof p.total === "number" ? p.total : null
      const trig =
        p.trigger === "manual" ? "manual re-run" : "auto run after generation"
      return total ? `${total} tests, ${trig}` : trig
    }
    case "test_execution_progress": {
      const s = String(p.status ?? "")
      if (s === "queued") return "Waiting for a runner"
      if (s === "running") return "Tests in progress"
      if (s === "succeeded") return "Tests finished"
      if (s === "failed") return "Tests stopped"
      return null
    }
    case "test_execution_test_outcome": {
      const tid = typeof p.test_id === "string" ? p.test_id.split("::").pop() : null
      const oc = String(p.outcome ?? "")
      if (tid) return `${tid} — ${oc}`
      return oc || null
    }
    case "test_execution_succeeded":
    case "test_execution_failed": {
      const summary = (p.summary ?? {}) as Record<string, unknown>
      const total = Number(summary.total ?? 0)
      const failed = Number(summary.failed ?? 0) + Number(summary.errored ?? 0)
      if (!total) return null
      const passed = Number(summary.passed ?? 0)
      return failed > 0
        ? `${passed} passed, ${failed} failed of ${total}`
        : `${passed} of ${total} passed`
    }
    case "test_execution_errored": {
      const err = typeof p.error === "string" ? p.error : null
      return err ? err.slice(0, 80) : null
    }
    default:
      return null
  }
}

/**
 * Whether an event row deserves a place in the timeline at all. Some
 * events (intermediate sandbox_progress states once we've already seen
 * a later one, duplicate interrupts, etc.) just add noise; the bucket
 * header already summarises the phase outcome.
 *
 * `keptAfter` mirrors the bucket's later events so we can hide
 * earlier transitional ones.
 */
export function shouldShowEvent(
  e: { type: string; payload: unknown },
  laterEvents: { type: string; payload: unknown }[],
): boolean {
  // Hide the run-kickoff "Started" envelope because its payload is
  // just the project + scenario id.
  if (e.type === "node_start" && e.payload != null) {
    const p = e.payload as Record<string, unknown>
    if ("project_id" in p && "scenario_id" in p) return false
  }

  // Collapse duplicate interrupt events on the same review type.
  if (e.type === "interrupt") {
    const dup = laterEvents.find(
      (l) =>
        l.type === "interrupt" &&
        JSON.stringify((l.payload as Record<string, unknown>) ?? {}) ===
          JSON.stringify((e.payload as Record<string, unknown>) ?? {}),
    )
    if (dup) return false
  }

  // Sandbox progress: keep only the final state. If a later progress
  // event exists in this bucket, hide the earlier ones.
  if (e.type === "sandbox_task_progress") {
    const laterProgress = laterEvents.find(
      (l) => l.type === "sandbox_task_progress",
    )
    if (laterProgress) return false
  }

  // Per-test outcomes stream in during execution. Once a final
  // test_execution_succeeded/_failed/_errored arrives, hide the
  // intermediate outcome events — the results tab shows them properly.
  if (e.type === "test_execution_test_outcome") {
    const hasFinal = laterEvents.some((l) =>
      ["test_execution_succeeded", "test_execution_failed", "test_execution_errored"].includes(l.type),
    )
    if (hasFinal) return false
  }

  return true
}

// ── Test cases ──────────────────────────────────────────────────────────────

const CASE_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  approved: "Approved",
  rejected: "Needs changes",
}

export function caseStatusLabel(status: string): string {
  return CASE_STATUS_LABEL[status] ?? status
}

const CASE_CATEGORY_TITLE: Record<string, string> = {
  happy: "What should normally work",
  edge: "Boundary or unusual conditions",
  corner: "Rare or unexpected situations",
}

const CASE_CATEGORY_BADGE: Record<string, string> = {
  happy: "Happy path",
  edge: "Edge case",
  corner: "Corner case",
}

export function caseCategoryTitle(cat: string): string {
  return CASE_CATEGORY_TITLE[cat] ?? cat
}

export function caseCategoryBadge(cat: string): string {
  return CASE_CATEGORY_BADGE[cat] ?? cat
}

// ── Test scenarios (feature tests) ──────────────────────────────────────────

const SCENARIO_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  in_progress: "In progress",
  completed: "Completed",
}

const SCENARIO_STATUS_TONE: Record<string, StatusTone> = {
  draft: "muted",
  in_progress: "accent",
  completed: "ok",
}

export function scenarioStatusLabel(status: TestScenarioStatus | string): string {
  return SCENARIO_STATUS_LABEL[status] ?? status
}

export function scenarioStatusTone(status: TestScenarioStatus | string): StatusTone {
  return SCENARIO_STATUS_TONE[status] ?? "muted"
}

// ── Phase helpers (used by the run-detail stepper) ──────────────────────────

export interface PhaseStep {
  key: "brief" | "sandbox" | "cases" | "scripts"
  label: string
  state: "pending" | "active" | "done"
}

/**
 * Map the run row's status to a 4-step stepper state. We intentionally
 * collapse the internal nodes (load_context, persist_results) into the
 * three user-visible phases.
 */
export function runStepperState(
  status: RunStatus | string,
): PhaseStep[] {
  const order: PhaseStep[] = [
    { key: "brief", label: "Brief", state: "pending" },
    { key: "sandbox", label: "Sandbox", state: "pending" },
    { key: "cases", label: "Test cases", state: "pending" },
    { key: "scripts", label: "Scripts", state: "pending" },
  ]
  const idx = (k: PhaseStep["key"]) => order.findIndex((s) => s.key === k)

  switch (status) {
    case "pending":
    case "agent1_running":
      order[idx("brief")]!.state = "active"
      break
    case "agent1_review":
      order[idx("brief")]!.state = "active"
      break
    case "agent2_running":
      order[idx("brief")]!.state = "done"
      order[idx("sandbox")]!.state = "active"
      break
    case "agent3_running":
      order[idx("brief")]!.state = "done"
      order[idx("sandbox")]!.state = "done"
      order[idx("cases")]!.state = "active"
      break
    case "agent3_review":
      order[idx("brief")]!.state = "done"
      order[idx("sandbox")]!.state = "done"
      order[idx("cases")]!.state = "active"
      break
    case "completed":
      order[idx("brief")]!.state = "done"
      order[idx("sandbox")]!.state = "done"
      order[idx("cases")]!.state = "done"
      // The Scripts step stays pending until a bundle is generated.
      // Callers can override it once they fetch the latest bundle.
      break
    case "failed":
      // Mark the active step (if any) as pending; nothing's done past
      // the run's current_node from the caller's perspective.
      break
  }
  return order
}

/** Whether a run is actively doing work (vs queued or paused for review). */
export function isActiveRun(status: RunStatus | string): boolean {
  return (
    status === "agent1_running" ||
    status === "agent2_running" ||
    status === "agent3_running"
  )
}

/** Whether a run is paused waiting for a human. */
export function isReviewPause(status: RunStatus | string): boolean {
  return status === "agent1_review" || status === "agent3_review"
}
