"use client"

import { PanelFeatureSpec } from "@/components/screens/run/panels/panel-feature-spec"
import { PanelGate2, PanelIdle } from "@/components/screens/run/panels/panel-idle"
import { PanelIngest } from "@/components/screens/run/panels/panel-ingest"
import { PanelTestCases } from "@/components/screens/run/panels/panel-test-cases"
import { PanelWorkspace } from "@/components/screens/run/panels/panel-workspace"
import type { RunNode } from "@/lib/types"

export function RightPanel({ node }: { node: RunNode }) {
  if (node.id === "ingest") return <PanelIngest />
  if (node.id === "a1" || node.id === "hitl1") return <PanelFeatureSpec />
  if (node.id === "a2") return <PanelWorkspace />
  if (node.id === "a3") return <PanelTestCases />
  if (node.id === "hitl2") return <PanelGate2 />
  if (node.kind === "gate") return <PanelGate2 />
  return <PanelIdle node={node} />
}
