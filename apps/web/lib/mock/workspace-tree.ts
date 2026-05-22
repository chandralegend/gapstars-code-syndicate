import type { WorkspaceNode } from "@/lib/types"

export const WORKSPACE_TREE: WorkspaceNode[] = [
  { kind: "folder", path: "outputs", open: true, depth: 0 },
  { kind: "file", path: "outputs/findings.md", depth: 1, active: true, isNew: true },
  { kind: "file", path: "outputs/events.jsonl", depth: 1 },
  { kind: "folder", path: "outputs/artifacts", open: true, depth: 1 },
  { kind: "file", path: "outputs/artifacts/api-trace.har", depth: 2 },
  { kind: "file", path: "outputs/artifacts/cart-merge.dot", depth: 2 },
  { kind: "file", path: "outputs/artifacts/screenshot-01.png", depth: 2, isNew: true },
  { kind: "folder", path: "scratch", open: false, depth: 0 },
  { kind: "folder", path: "src-refs", open: false, depth: 0 },
]
