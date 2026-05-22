"use client"

import { useEffect, useRef, useState } from "react"
import {
  ActivityIcon,
  FileTextIcon,
  FolderIcon,
  FolderOpenIcon,
  MouseIcon,
  PauseIcon,
  RefreshCwIcon,
  SquareIcon,
} from "lucide-react"

import { StatusDot } from "@/components/probe/status-dot"
import { Tag } from "@/components/probe/tag"
import { PanelFrame, PanelHead } from "@/components/screens/run/panels/panel-frame"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useEventStream } from "@/hooks/use-event-stream"
import { WORKSPACE_TREE } from "@/lib/mock/workspace-tree"
import { Kbd } from "@/components/probe/kbd"
import type { AgentEvent } from "@/lib/types"
import { cn } from "@/lib/utils"

export function PanelWorkspace() {
  const { events } = useEventStream()

  return (
    <PanelFrame>
      <PanelHead
        num="02"
        numClassName="bg-accent text-foreground"
        title="Workspace exploration"
        desc={
          <>
            E2B sandbox <span className="font-mono">wks_018f2c</span> · 1m 42s
            elapsed
          </>
        }
        right={
          <>
            <Badge variant="accent" className="gap-1.5">
              <StatusDot kind="running" size={6} />
              running
            </Badge>
            <Button variant="ghost" size="sm">
              <PauseIcon className="size-[13px]" />
              Pause
            </Button>
            <Button variant="ghost" size="sm">
              <SquareIcon className="size-[13px]" />
              Stop
            </Button>
          </>
        }
      />
      <Tabs defaultValue="findings" className="flex min-h-0 flex-1 flex-col">
        <TabsList className="border-border h-auto justify-start gap-1 rounded-none border-b bg-transparent px-6 py-0">
          <Tab value="findings" icon={<FileTextIcon className="size-[13px]" />}>
            Findings
            <span className="bg-muted text-ink-3 ml-1.5 rounded-[3px] px-1.5 py-px font-mono text-[10px]">
              3
            </span>
          </Tab>
          <Tab value="events" icon={<ActivityIcon className="size-[13px]" />}>
            Live events
            <span className="bg-muted text-ink-3 ml-1.5 rounded-[3px] px-1.5 py-px font-mono text-[10px]">
              {events.length}
            </span>
          </Tab>
          <Tab value="screen" icon={<MouseIcon className="size-[13px]" />}>
            Live screen
          </Tab>
        </TabsList>

        <TabsContent value="findings" className="bg-muted/40 min-h-0 flex-1 overflow-hidden p-0">
          <WorkspaceTreePane />
        </TabsContent>
        <TabsContent value="events" className="min-h-0 flex-1 overflow-auto px-6 py-5">
          <EventsBody events={events} />
        </TabsContent>
        <TabsContent value="screen" className="min-h-0 flex-1 overflow-auto px-6 py-5">
          <LiveScreenBody />
        </TabsContent>
      </Tabs>
    </PanelFrame>
  )
}

function Tab({
  value,
  icon,
  children,
}: {
  value: string
  icon?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <TabsTrigger
      value={value}
      className="text-ink-3 data-[state=active]:text-foreground data-[state=active]:border-foreground hover:text-foreground gap-1.5 rounded-none border-b-2 border-transparent bg-transparent px-3 py-2.5 text-[12.5px] data-[state=active]:bg-transparent data-[state=active]:shadow-none"
    >
      {icon}
      {children}
    </TabsTrigger>
  )
}

function WorkspaceTreePane() {
  const [active, setActive] = useState("outputs/findings.md")
  return (
    <div className="grid h-full grid-cols-[240px_1fr] overflow-hidden">
      <div className="border-border bg-background overflow-auto border-r p-2.5">
        <div className="text-ink-4 px-1.5 pt-1 pb-2 font-mono text-[11px]">
          /workspace
        </div>
        {WORKSPACE_TREE.map((n, i) => (
          <button
            key={i}
            type="button"
            onClick={() => n.kind === "file" && setActive(n.path)}
            className={cn(
              "flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-[12.5px]",
              active === n.path
                ? "bg-foreground/10 text-foreground"
                : "text-ink-2 hover:bg-muted",
              n.isNew && "text-accent-ink"
            )}
            style={{ paddingLeft: 6 + n.depth * 14 }}
          >
            {n.kind === "folder" ? (
              n.open ? (
                <FolderOpenIcon className="size-[14px] shrink-0" />
              ) : (
                <FolderIcon className="size-[14px] shrink-0" />
              )
            ) : (
              <FileTextIcon className="size-[14px] shrink-0" />
            )}
            <span className="truncate">{n.path.split("/").pop()}</span>
          </button>
        ))}
      </div>
      <div className="overflow-auto p-5">
        <div className="mb-3 flex items-center gap-2.5">
          <code className="bg-muted rounded px-2 py-0.5 font-mono text-[12px]">
            {active}
          </code>
          <Badge variant="accent" className="gap-1.5">
            <StatusDot kind="running" size={6} />
            writing
          </Badge>
          <div className="text-ink-4 ml-auto flex items-center gap-1 font-mono text-[11px]">
            <RefreshCwIcon className="size-[11px]" />
            auto-tail
          </div>
        </div>
        <FindingsRender />
      </div>
    </div>
  )
}

function FindingsRender() {
  return (
    <div className="border-border bg-card max-w-[720px] rounded-lg border p-6 leading-relaxed">
      <h2
        className="font-serif text-[22px] leading-tight tracking-[-0.01em]"
        style={{ fontFamily: "var(--font-serif), serif" }}
      >
        Workspace Findings — Saved Carts
      </h2>
      <div className="text-ink-4 mt-1 font-mono text-[11.5px]">
        last write: 12s ago · auto-flushed
      </div>

      <H3>Endpoints discovered</H3>
      <ul className="border-line-2 mt-2 space-y-0 border-t">
        <FindingItem>
          <code>POST /api/cart/save</code> — confirmed Auth required (401 without
          bearer). Returns <code>{`{ cart_id, saved_at }`}</code>.{" "}
          <strong>Idempotency-Key header is honored</strong>, not the JSON body
          field as the spec implied.
        </FindingItem>
        <FindingItem>
          <code>GET /api/cart/active</code> — returns 204 when no cart,{" "}
          <strong>200 with empty cart array when cart exists but is empty</strong>{" "}
          — minor inconsistency vs. spec.
        </FindingItem>
        <FindingItem>
          <code>POST /api/cart/merge</code> — 200 with <code>conflicts[]</code>{" "}
          populated when SKU exists in both. <code>conflicts[].reason</code>{" "}
          undocumented in spec.
        </FindingItem>
      </ul>

      <H3>Behavior observed</H3>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-[13.5px]">
        <li>Anon→auth merge sums quantities correctly for identical SKUs.</li>
        <li>
          Tiered pricing: on conflict, server picks the <strong>lower</strong>{" "}
          tier — different from spec&apos;s &ldquo;account tier&rdquo;.
        </li>
        <li>Restore window: hardcoded 7 days; no env override visible.</li>
      </ol>

      <H3>Risks / open questions</H3>
      <div className="mt-2 space-y-2">
        <RiskCard tone="err" idx="R1" text="Race reproduced: two saves within ~150 ms produce duplicate cart_ids." />
        <RiskCard tone="warn" idx="R2" text="No rate limit headers on /cart/save — potentially abusable." />
        <RiskCard tone="info" idx="R3" text="iOS app caches cart for 4 h locally; 'restore on another device' can show stale state." />
      </div>

      <div className="text-accent-ink mt-4 flex items-center gap-1.5 font-mono text-[11.5px]">
        <StatusDot kind="running" size={6} />
        Agent is writing more…
      </div>
    </div>
  )
}

function H3({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-ink-4 mt-5 mb-1 font-mono text-[11px] font-semibold tracking-wider uppercase">
      {children}
    </h3>
  )
}

function FindingItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="border-line-2 relative border-b py-2 pl-5 text-[13.5px] last:border-b-0">
      <span className="bg-info absolute top-[14px] left-0 size-[5px] rounded-full" />
      {children}
    </li>
  )
}

function RiskCard({
  tone,
  idx,
  text,
}: {
  tone: "err" | "warn" | "info"
  idx: string
  text: string
}) {
  const bg =
    tone === "err"
      ? "bg-err-soft text-err-ink border-err/30"
      : tone === "warn"
        ? "bg-warn-soft text-warn-ink border-warn/30"
        : "bg-info-soft text-info-ink border-info/30"
  const tag =
    tone === "err"
      ? "bg-err-ink"
      : tone === "warn"
        ? "bg-warn-ink"
        : "bg-info-ink"
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-md border px-3 py-2 text-[13px]",
        bg
      )}
    >
      <span className={cn("mt-0.5 shrink-0 rounded px-1.5 py-px font-mono text-[10px] font-semibold text-white", tag)}>
        {idx}
      </span>
      <span>{text}</span>
    </div>
  )
}

function EventsBody({ events }: { events: AgentEvent[] }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" })
  }, [events.length])
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <div className="font-serif text-[20px]" style={{ fontFamily: "var(--font-serif), serif" }}>
          Live event stream
        </div>
        <Badge variant="accent" className="gap-1.5">
          <StatusDot kind="running" size={6} />
          streaming
        </Badge>
        <div className="ml-auto flex gap-2">
          <Tag>thought</Tag>
          <Tag>tool</Tag>
          <Tag>http</Tag>
          <Tag>fs</Tag>
        </div>
      </div>
      <div
        ref={ref}
        className="border-border bg-card max-h-[460px] overflow-auto rounded-md border font-mono text-[12px]"
      >
        {events.map((e, i) => (
          <EventLine key={i} e={e} />
        ))}
        <div className="text-ink-4 flex items-center gap-2.5 px-3 py-1.5">
          <span className="w-14 text-[11px]">…</span>
          <span className="w-16 shrink-0 text-[10px] tracking-wide uppercase">…thinking</span>
          <span
            className="bg-ink-4 h-3 w-[3px] opacity-70"
            style={{ animation: "probe-caret 0.9s infinite" }}
          />
        </div>
      </div>
    </div>
  )
}

function EventLine({ e }: { e: AgentEvent }) {
  const color =
    e.kind === "thought"
      ? "text-info-ink"
      : e.kind === "http"
        ? "text-accent-ink"
        : e.kind === "tool"
          ? "text-foreground"
          : "text-ok-ink"
  return (
    <div className="border-line-2 flex gap-2.5 border-b px-3 py-1.5 last:border-b-0">
      <span className="text-ink-4 w-14 shrink-0">{e.t}</span>
      <span className={cn("w-16 shrink-0 text-[10px] font-semibold tracking-wide uppercase", color)}>
        {e.kind}
      </span>
      <span className="text-ink-2 min-w-0 flex-1 whitespace-pre-wrap">{e.msg}</span>
    </div>
  )
}

function LiveScreenBody() {
  return (
    <div className="max-w-[760px]">
      <div className="mb-3 flex items-center gap-2">
        <div className="font-serif text-[20px]" style={{ fontFamily: "var(--font-serif), serif" }}>
          Live browser view
        </div>
        <Badge variant="accent" className="gap-1.5">
          <StatusDot kind="running" size={6} />
          noVNC · 30 fps
        </Badge>
      </div>
      <div className="border-border overflow-hidden rounded-md border">
        <div className="border-border bg-muted flex items-center gap-2.5 border-b px-3 py-2">
          <div className="flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <span key={i} className="bg-ink-4/50 size-2.5 rounded-full" />
            ))}
          </div>
          <div className="border-border bg-card ml-2 rounded px-2 py-0.5 font-mono text-[11px]">
            https://staging.acme.shop/cart
          </div>
          <Tag>chromium 124</Tag>
        </div>
        <div className="bg-card text-ink-3 relative grid h-[300px] place-items-center text-[13px]">
          placeholder · workspace browser frame
          <div className="absolute top-[44%] left-[62%] flex flex-col items-center gap-1">
            <MouseIcon className="size-[20px]" />
            <div className="text-ink-3 font-mono text-[10px]">agent · 1.2s ago</div>
          </div>
        </div>
      </div>
      <div className="text-ink-3 mt-3 text-[12px]">
        The agent drives a real Chromium sandbox. Take over manually with{" "}
        <Kbd>⌘⇧M</Kbd> to pin a step, or watch passively — every click and HTTP
        call is recorded to{" "}
        <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-[11px]">
          events.jsonl
        </code>
        .
      </div>
    </div>
  )
}
