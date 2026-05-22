import type { RunSummary } from "@/lib/types"

export const RECENT_RUNS: RunSummary[] = [
  { id: "run_018f2c", test: "Saved Carts — Cross-Device Persistence", status: "running", started: "2m ago", duration: "—", cases: "—" },
  { id: "run_018f2b", test: "Checkout — Apple Pay rollback", status: "done", started: "1h ago", duration: "4m 12s", cases: "11" },
  { id: "run_018f2a", test: "Search — Typo tolerance v2", status: "done", started: "yesterday", duration: "3m 02s", cases: "9" },
  { id: "run_018f29", test: "Profile — Email change flow", status: "err", started: "yesterday", duration: "1m 18s", cases: "0" },
  { id: "run_018f28", test: "Checkout — Apple Pay rollback", status: "done", started: "3 days ago", duration: "5m 41s", cases: "12" },
  { id: "run_018f27", test: "Auth — Magic link", status: "done", started: "4 days ago", duration: "2m 49s", cases: "8" },
]
