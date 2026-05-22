/**
 * Time formatting helpers + a tiny `<RelativeTime/>` component.
 *
 * Renders a relative phrase ("2 min ago") with the absolute timestamp as
 * the `title` attribute so users can hover to see the precise time.
 */
"use client"

import { useEffect, useState } from "react"

const SECOND = 1_000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export function formatRelative(input: string | Date | number): string {
  const ts = typeof input === "string" ? Date.parse(input) : new Date(input).getTime()
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
  // Older than a week — fall back to absolute date.
  return new Date(ts).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

export function formatAbsolute(input: string | Date | number): string {
  const d = typeof input === "string" ? new Date(input) : new Date(input)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleString(undefined, {
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

/** Tiny component that re-renders every minute so "2 min ago" stays fresh. */
export function RelativeTime({
  iso,
  className,
}: {
  iso: string | undefined
  className?: string
}) {
  const [, force] = useState(0)
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 60_000)
    return () => clearInterval(t)
  }, [])
  if (!iso) return <span className={className}>—</span>
  return (
    <time className={className} dateTime={iso} title={formatAbsolute(iso)}>
      {formatRelative(iso)}
    </time>
  )
}
