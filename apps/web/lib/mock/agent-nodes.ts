import type { RunNode } from "@/lib/types"

export const AGENT_NODES: RunNode[] = [
  {
    id: "ingest",
    agent: "00",
    name: "Ingest & plan",
    desc: "Validate project context, draft run plan.",
    status: "done",
    elapsed: "3.1s",
  },
  {
    id: "a1",
    agent: "01",
    name: "Feature understanding",
    desc: "Read brief + repo refs → versioned FeatureExpectation.",
    status: "done",
    elapsed: "21.4s",
  },
  {
    id: "hitl1",
    kind: "gate",
    name: "Review feature expectation",
    status: "done",
    when: "2 min ago",
  },
  {
    id: "a2",
    agent: "02",
    name: "Workspace exploration",
    desc: "Spin sandbox, probe APIs & UI, write findings.",
    status: "running",
    elapsed: "1m 42s",
    progress: 0.62,
  },
  {
    id: "a3",
    agent: "03",
    name: "Test case synthesis",
    desc: "Synthesize happy / edge / corner cases from findings.",
    status: "idle",
  },
  {
    id: "hitl2",
    kind: "gate",
    name: "Review test cases",
    status: "idle",
  },
]
