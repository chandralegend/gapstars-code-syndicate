export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

export type ProjectStatus = "active" | "draft" | "archived"

export interface Project {
  id: string
  name: string
  description: string
  stagingUrl: string
  testsetCount: number
  runsThisWeek: number
  status: ProjectStatus
  createdAt: string
}

export type NodeStatus = "idle" | "running" | "done" | "err" | "wait"

export interface AgentNode {
  id: string
  kind?: undefined
  agent: string
  name: string
  desc: string
  status: NodeStatus
  elapsed?: string
  progress?: number
}

export interface GateNode {
  id: string
  kind: "gate"
  agent?: undefined
  name: string
  status: NodeStatus
  when?: string
  desc?: undefined
}

export type RunNode = AgentNode | GateNode

export interface FeatureSpec {
  title: string
  lede: string
  what: string[]
  flows: string[]
  contracts: string[]
  acceptance: string[]
}

export type TestCaseKind = "happy" | "edge" | "corner"
export type TestPriority = "P0" | "P1" | "P2"

export interface TestCase {
  id: string
  title: string
  desc: string
  steps?: string[]
  expect: string
  priority: TestPriority
  kind: TestCaseKind
}

export interface WorkspaceNode {
  kind: "folder" | "file"
  path: string
  depth: number
  open?: boolean
  active?: boolean
  isNew?: boolean
}

export type AgentEventKind = "thought" | "http" | "tool" | "fs"

export interface AgentEvent {
  t: string
  kind: AgentEventKind
  msg: string
}

export type RunStatus = "running" | "done" | "err"

export interface RunSummary {
  id: string
  test: string
  status: RunStatus
  started: string
  duration: string
  cases: string
}

export type ScriptLang = "Playwright" | "Pytest"
export type ScriptStatus = "passed" | "failed" | "draft"

export interface Script {
  id: string
  name: string
  lang: ScriptLang
  lastRun: string
  status: ScriptStatus
  duration: string
}

export interface TestRow {
  id: string
  name: string
  desc: string
  lastRun: string
  status: "running" | "passed" | "failed"
  cases: number
  scripts: number
  runs: number
}

export interface BreadcrumbItem {
  label: string
  muted?: boolean
  mono?: boolean
  href?: string
}
