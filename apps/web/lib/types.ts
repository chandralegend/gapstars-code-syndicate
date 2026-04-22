export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

export type AgentName = "triage" | "order_support" | "technical_support"

// ── Activity events (agent transitions, tool calls) ─────────────────────────

export type ActivityEvent =
  | { type: "agent_switch"; agent: AgentName; from: AgentName | null; timestamp: Date }
  | { type: "tool_call"; tool: string; toolLabel: string; args: Record<string, unknown>; agent: AgentName; timestamp: Date }
  | { type: "tool_result"; tool: string; toolLabel: string; result: string; agent: AgentName; timestamp: Date }

// ── Chat messages ───────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  createdAt: Date
  agent?: AgentName
  /** Activity events that occurred during this assistant response */
  activity: ActivityEvent[]
}

// ── SSE stream chunks ───────────────────────────────────────────────────────

export interface StreamChunk {
  // Token event
  token?: string
  // Done event
  thread_id?: string
  // Error event
  detail?: string
  // Agent switch event
  agent?: AgentName
  agentFrom?: AgentName | null
  // Tool call event
  toolCall?: { tool: string; toolLabel: string; args: Record<string, unknown>; agent: AgentName }
  // Tool result event
  toolResult?: { tool: string; toolLabel: string; result: string; agent: AgentName }
}

// ── Agent display config ────────────────────────────────────────────────────

export const AGENT_DISPLAY: Record<
  AgentName,
  { label: string; color: string; bgMuted: string }
> = {
  triage: {
    label: "Triage",
    color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    bgMuted: "border-blue-200 dark:border-blue-800",
  },
  order_support: {
    label: "Order Support",
    color: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
    bgMuted: "border-amber-200 dark:border-amber-800",
  },
  technical_support: {
    label: "Tech Support",
    color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
    bgMuted: "border-emerald-200 dark:border-emerald-800",
  },
}
