"use client"

import { StatusDot } from "@/components/probe/status-dot"
import { Badge } from "@/components/ui/badge"
import {
  runStatusDot,
  runStatusLabel,
  runStatusTone,
} from "@/lib/labels"

/**
 * Single source of truth for run status badges across the app. Maps the
 * raw enum into a plain-English label, a colour tone, and a dot kind.
 */
export function RunStatusBadge({ status }: { status: string }) {
  const tone = runStatusTone(status)
  // <Badge>'s known variants overlap with `tone` exactly except "muted"
  // which we keep as the default.
  const variant = tone === "muted" ? "muted" : tone
  return (
    <Badge variant={variant} className="gap-1.5">
      <StatusDot kind={runStatusDot(status)} size={6} />
      {runStatusLabel(status)}
    </Badge>
  )
}
