"use client"

import { useEffect, useState } from "react"

import { EVENT_STREAM } from "@/lib/mock/event-stream"
import type { AgentEvent } from "@/lib/types"

const INITIAL_COUNT = 8
const TICK_MS = 1800

/**
 * Mock-backed live event stream for a run. Yields the first 8 events
 * immediately, then appends one every 1.8 s. Shape is intentionally close
 * to what an EventSource reader will produce so the swap is mechanical.
 */
export function useEventStream(): { events: AgentEvent[]; isStreaming: boolean } {
  const [events, setEvents] = useState<AgentEvent[]>(() => EVENT_STREAM.slice(0, INITIAL_COUNT))

  useEffect(() => {
    if (events.length >= EVENT_STREAM.length) return
    const id = setTimeout(() => {
      setEvents((prev) => {
        if (prev.length >= EVENT_STREAM.length) return prev
        return [...prev, EVENT_STREAM[prev.length]]
      })
    }, TICK_MS)
    return () => clearTimeout(id)
  }, [events.length])

  return { events, isStreaming: events.length < EVENT_STREAM.length }
}
