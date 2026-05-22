import type { Script } from "@/lib/types"

export const SCRIPTS: Script[] = [
  { id: "scr_001", name: "TC-001 · Save and restore on same account", lang: "Playwright", lastRun: "12 min ago", status: "passed", duration: "8.4s" },
  { id: "scr_002", name: "TC-002 · Anon→auth merge dedupes by SKU", lang: "Playwright", lastRun: "12 min ago", status: "passed", duration: "11.2s" },
  { id: "scr_003", name: "TC-003 · Idempotent /cart/save replay", lang: "Pytest", lastRun: "12 min ago", status: "passed", duration: "1.9s" },
  { id: "scr_101", name: "TC-101 · Orphaned local items on mid-merge fail", lang: "Pytest", lastRun: "12 min ago", status: "failed", duration: "4.6s" },
  { id: "scr_102", name: "TC-102 · Conflicting SKU on tiered pricing", lang: "Pytest", lastRun: "—", status: "draft", duration: "—" },
]
