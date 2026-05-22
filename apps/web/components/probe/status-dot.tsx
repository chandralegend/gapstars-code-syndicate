import { cn } from "@/lib/utils"

const COLORS = {
  running: "bg-accent",
  done: "bg-ok",
  err: "bg-err",
  wait: "bg-warn",
  idle: "bg-muted-foreground/40",
} as const

export type StatusDotKind = keyof typeof COLORS

export function StatusDot({
  kind,
  className,
  size = 8,
}: {
  kind: StatusDotKind
  className?: string
  size?: number
}) {
  return (
    <span
      className={cn("relative inline-block shrink-0 rounded-full", COLORS[kind], className)}
      style={{ width: size, height: size }}
    >
      {kind === "running" && (
        <span
          aria-hidden
          className="bg-accent absolute -inset-[3px] rounded-full"
          style={{ animation: "probe-pulse 1.4s ease-in-out infinite" }}
        />
      )}
    </span>
  )
}
