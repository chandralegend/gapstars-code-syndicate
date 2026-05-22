import { ClockIcon, EyeIcon } from "lucide-react"

import {
  PanelBody,
  PanelFrame,
  PanelHead,
} from "@/components/screens/run/panels/panel-frame"
import type { AgentNode } from "@/lib/types"

export function PanelIdle({ node }: { node: AgentNode }) {
  return (
    <PanelFrame>
      <PanelHead
        num={node.agent ?? "—"}
        numClassName="bg-muted text-ink-3 border border-border"
        title={node.name}
        desc={node.desc ?? "Queued — waiting on previous node"}
      />
      <PanelBody>
        <Empty>
          <div className="bg-muted text-ink-3 grid size-12 place-items-center rounded-full">
            <ClockIcon className="size-[20px]" />
          </div>
          <div className="mt-3 text-[16px] font-medium">Not started yet</div>
          <div className="text-ink-3 mt-1 max-w-[400px] text-center text-[13px]">
            This node will run once{" "}
            <strong>
              {node.id === "a3" ? "Agent 2" : "the previous step"}
            </strong>{" "}
            completes and is reviewed.
          </div>
        </Empty>
      </PanelBody>
    </PanelFrame>
  )
}

export function PanelGate2() {
  return (
    <PanelFrame>
      <PanelHead
        icon={<EyeIcon className="text-ink-3 size-[18px]" />}
        title="Review test cases"
        desc="Final human-in-the-loop gate before script generation"
      />
      <PanelBody>
        <Empty>
          <div className="bg-muted text-ink-3 grid size-12 place-items-center rounded-full">
            <ClockIcon className="size-[20px]" />
          </div>
          <div className="mt-3 text-[16px] font-medium">Waiting for Agent 3</div>
          <div className="text-ink-3 mt-1 max-w-[420px] text-center text-[13px]">
            Once Agent 3 returns its TestCase batch, this gate becomes
            interactive — accept, edit, or send feedback per case.
          </div>
        </Empty>
      </PanelBody>
    </PanelFrame>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center py-10">
      {children}
    </div>
  )
}
