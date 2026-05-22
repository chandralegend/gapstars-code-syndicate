"use client"

import { useCallback, useEffect, useRef, useState } from "react"

/**
 * Minimal data-fetching hook. Re-runs when `deps` change. Provides
 * `mutate()` to manually refresh and `setData()` for optimistic updates.
 *
 * Designed so we don't pull in TanStack Query for a handful of calls.
 */
export function useFetch<T>(
  fetcher: () => Promise<T>,
  deps: ReadonlyArray<unknown> = [],
) {
  const [data, setData] = useState<T | undefined>(undefined)
  const [error, setError] = useState<Error | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const cancelled = useRef(false)
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  const run = useCallback(async () => {
    setLoading(true)
    try {
      const result = await fetcherRef.current()
      if (!cancelled.current) {
        setData(result)
        setError(undefined)
      }
    } catch (e) {
      if (!cancelled.current) {
        setError(e instanceof Error ? e : new Error(String(e)))
      }
    } finally {
      if (!cancelled.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    cancelled.current = false
    run()
    return () => {
      cancelled.current = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { data, error, loading, mutate: run, setData }
}

/**
 * Tiny mutation hook — wraps an async action with `loading` and `error`
 * state. Returns a stable `run` callback.
 */
export function useMutation<Args extends unknown[], R>(
  action: (...args: Args) => Promise<R>,
) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | undefined>(undefined)
  const actionRef = useRef(action)
  actionRef.current = action

  const run = useCallback(async (...args: Args) => {
    setLoading(true)
    setError(undefined)
    try {
      return await actionRef.current(...args)
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e))
      setError(err)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  return { run, loading, error }
}
