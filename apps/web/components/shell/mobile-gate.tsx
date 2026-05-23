"use client"

import { useEffect, useState } from "react"
import { MonitorIcon } from "lucide-react"

/**
 * A hard block for sub-1024px viewports. Renders a full-screen panel
 * over the app shell with a "this is a desktop tool" message.
 *
 * Why a hard block instead of a responsive layout: the run-detail page
 * is dense (timeline + cases + sandbox + scripts), and shipping a real
 * mobile experience for it is a separate piece of work. A clear
 * "switch to desktop" nudge is far better than a half-broken layout.
 *
 * The component is rendered inside <AppShell/>, but it lives in its
 * own fixed layer so it sits above sidebar + topbar + content.
 *
 * SSR-safe: we render nothing until we've measured the window once on
 * the client, so the initial paint never flashes the overlay.
 */
export function MobileGate() {
  const [tooSmall, setTooSmall] = useState<boolean | null>(null)

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023.98px)")
    const update = () => setTooSmall(mq.matches)
    update()
    mq.addEventListener("change", update)
    return () => mq.removeEventListener("change", update)
  }, [])

  if (tooSmall !== true) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="mobile-gate-title"
      className="bg-background fixed inset-0 z-[100] grid place-items-center px-6"
    >
      <div className="w-full max-w-[420px] text-center">
        <div className="border-border bg-card mx-auto mb-6 grid size-14 place-items-center rounded-full border">
          <MonitorIcon className="text-foreground size-6" strokeWidth={1.5} />
        </div>
        <h1
          id="mobile-gate-title"
          className="text-foreground text-[22px] leading-tight font-semibold tracking-[-0.02em]"
        >
          QALoop is built for desktop
        </h1>
        <p className="text-ink-3 mt-3 text-[13.5px] leading-relaxed">
          Reviewing runs, briefs, and live sandbox traces takes more
          screen than a phone or tablet can comfortably show. Open
          QALoop on a desktop browser to continue.
        </p>
        <div className="border-border bg-muted mt-6 inline-flex items-center gap-2 rounded-md border px-3 py-1.5 font-mono text-[12px]">
          <span className="text-ink-4">URL</span>
          <span className="text-foreground select-all">
            {typeof window !== "undefined" ? window.location.host : ""}
          </span>
        </div>
      </div>
    </div>
  )
}
