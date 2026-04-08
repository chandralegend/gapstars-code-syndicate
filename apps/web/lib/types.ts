export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

export type AgentName = "triage" | "order_support" | "technical_support"

export interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  createdAt: Date
  agent?: AgentName
}

export interface StreamChunk {
  token?: string
  thread_id?: string
  detail?: string
  agent?: AgentName
}

export const AGENT_DISPLAY: Record<
  AgentName,
  { label: string; color: string }
> = {
  triage: {
    label: "Triage",
    color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  },
  order_support: {
    label: "Order Support",
    color:
      "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  },
  technical_support: {
    label: "Tech Support",
    color:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  },
}
