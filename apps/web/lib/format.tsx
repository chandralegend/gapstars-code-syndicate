/**
 * Time formatting helpers + a tiny `<RelativeTime/>` component.
 *
 * Renders a relative phrase ("2 min ago") with the absolute timestamp as
 * the `title` attribute so users can hover to see the precise time.
 *
 * All `<RelativeTime/>` instances share one 30s ticker via a module-level
 * pub/sub so we don't pay one setInterval per row in tables and lists.
 */
"use client"

import { useEffect, useState } from "react"

const SECOND = 1_000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/**
 * Parse an ISO-ish timestamp into ms-since-epoch. The API serializes
 * timezone-naive UTC datetimes (e.g. "2026-05-25T12:34:56" or
 * "2026-05-25T12:34:56.789012") with no Z suffix, which `Date.parse`
 * interprets as *local time* — that's how a fresh run can look 5-6h
 * old to a user in a +0530 timezone.
 *
 * If the input has no explicit timezone marker, we treat it as UTC.
 */
export function parseTs(input: string | Date | number): number {
  if (typeof input !== "string") return new Date(input).getTime()
  const trimmed = input.trim()
  // Already has a TZ marker (Z, +hh:mm, or -hh:mm at the end).
  if (/(?:Z|[+-]\d{2}:?\d{2})$/.test(trimmed)) return Date.parse(trimmed)
  // Looks like a date-only string ("2026-05-25") — let Date handle it.
  if (!/T\d/.test(trimmed)) return Date.parse(trimmed)
  // Naive datetime — treat as UTC.
  return Date.parse(trimmed + "Z")
}

export function formatRelative(input: string | Date | number): string {
  const ts = parseTs(input)
  if (!Number.isFinite(ts)) return ""
  const diff = Date.now() - ts
  const abs = Math.abs(diff)
  const future = diff < 0
  const pick = (n: number, unit: string) =>
    `${n} ${unit}${n === 1 ? "" : "s"} ${future ? "from now" : "ago"}`

  if (abs < 5 * SECOND) return future ? "in a moment" : "just now"
  if (abs < MINUTE) return pick(Math.round(abs / SECOND), "sec")
  if (abs < HOUR) return pick(Math.round(abs / MINUTE), "min")
  if (abs < DAY) return pick(Math.round(abs / HOUR), "hour")
  if (abs < 7 * DAY) return pick(Math.round(abs / DAY), "day")
  return new Date(ts).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

export function formatAbsolute(input: string | Date | number): string {
  const ts = parseTs(input)
  if (!Number.isFinite(ts)) return ""
  return new Date(ts).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const s = Math.round(ms / 100) / 10
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const r = Math.round(s % 60)
  return `${m}m ${r}s`
}

// ── Shared ticker ──────────────────────────────────────────────────────────
//
// One setInterval, many subscribers. The 30s cadence is fine for
// "X min ago" granularity; finer-grained countdowns own their own timer.

const tickerSubscribers = new Set<() => void>()
let tickerHandle: ReturnType<typeof setInterval> | null = null

function subscribeTicker(cb: () => void): () => void {
  tickerSubscribers.add(cb)
  if (tickerHandle === null) {
    tickerHandle = setInterval(() => {
      for (const fn of tickerSubscribers) fn()
    }, 30_000)
  }
  return () => {
    tickerSubscribers.delete(cb)
    if (tickerSubscribers.size === 0 && tickerHandle !== null) {
      clearInterval(tickerHandle)
      tickerHandle = null
    }
  }
}

/**
 * Re-renders every ~30 seconds so 'X min ago' stays fresh. Subscribes to
 * a shared interval so a list of 50 rows costs one timer, not 50.
 */
export function RelativeTime({
  iso,
  className,
}: {
  iso: string | undefined
  className?: string
}) {
  const [, force] = useState(0)
  useEffect(() => {
    return subscribeTicker(() => force((n) => n + 1))
  }, [])
  if (!iso) return <span className={className}>—</span>
  return (
    <time className={className} dateTime={iso} title={formatAbsolute(iso)}>
      {formatRelative(iso)}
    </time>
  )
}
