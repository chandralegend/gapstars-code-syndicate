/**
 * Plain-English label helpers. Keeps every user-facing string in one place
 * so we don't leak internal node/event identifiers into the UI.
 */
import type { RunStatus } from "@/lib/api"

// ── Run status ──────────────────────────────────────────────────────────────

const RUN_STATUS_LABEL: Record<RunStatus, string> = {
  pending: "Queued",
  agent1_running: "Drafting the brief",
  agent1_review: "Awaiting brief review",
  agent2_running: "Exploring in the sandbox",
  agent3_running: "Generating test cases",
  agent3_review: "Awaiting test-case review",
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
  agent_1_generate: "Drafting the brief",
  human_review_1: "Brief review",
  agent_2_placeholder: "Sandbox exploration",
  agent_3_generate: "Generating test cases",
  human_review_3: "Test-case review",
  persist_results: "Saving results",
}

const NODE_PHASE: Record<string, string> = {
  load_project_context: "Setup",
  agent_1_generate: "Brief",
  human_review_1: "Brief",
  agent_2_placeholder: "Sandbox",
  agent_3_generate: "Test cases",
  human_review_3: "Test cases",
  persist_results: "Saving",
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
      return "Drafting the brief"
    case "agent1_review":
      return "Review the brief"
    case "agent2_running":
      return "Exploring in the sandbox"
    case "agent3_running":
      return "Generating test cases"
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
  error: "Error",
  done: "Stream closed",
}

export function eventLabel(eventType: string): string {
  return EVENT_LABEL[eventType] ?? eventType
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
