import { Headset, Package, Wrench } from "lucide-react"

import { type AgentName, AGENT_DISPLAY } from "@/lib/types"
import { cn } from "@/lib/utils"

const AGENT_ICONS: Record<AgentName, React.ElementType> = {
  triage: Headset,
  order_support: Package,
  technical_support: Wrench,
}

interface AgentBadgeProps {
  agent: AgentName
  className?: string
}

export function AgentBadge({ agent, className }: AgentBadgeProps) {
  const display = AGENT_DISPLAY[agent]
  const Icon = AGENT_ICONS[agent]

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        display.color,
        className
      )}
    >
      <Icon className="size-3" />
      {display.label}
    </span>
  )
}
