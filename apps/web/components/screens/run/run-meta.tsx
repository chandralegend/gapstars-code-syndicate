import { Badge } from "@/components/ui/badge"
import { StatusDot } from "@/components/probe/status-dot"

export function RunMeta({ runId }: { runId: string }) {
  return (
    <div className="border-border bg-card mb-5 space-y-1.5 rounded-lg border p-4">
      <Row label="Run">
        <span className="font-mono">{runId}</span>
        <span className="ml-auto">
          <Badge variant="accent" className="gap-1.5">
            <StatusDot kind="running" size={6} />
            running
          </Badge>
        </span>
      </Row>
      <Row label="Test">Saved Carts — Cross-Device Persistence</Row>
      <Row label="Started">
        <span className="font-mono">2 min ago · by Mira Chen</span>
      </Row>
      <Row label="Node">
        <span className="font-mono">agent_2.workspace</span>
      </Row>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-[12.5px]">
      <span className="text-ink-3 w-[60px] shrink-0">{label}</span>
      <span className="flex min-w-0 flex-1 items-center gap-2">{children}</span>
    </div>
  )
}
