import type { RunSummary } from "@/lib/types"

export const RECENT_RUNS: RunSummary[] = [
  { id: "run_018f2c", test: "Saved Carts — Cross-Device Persistence", status: "running", started: "2m ago", duration: "—", cost: "$0.40", cases: "—", by: "Mira Chen" },
  { id: "run_018f2b", test: "Checkout — Apple Pay rollback", status: "done", started: "1h ago", duration: "4m 12s", cost: "$0.71", cases: "11", by: "Mira Chen" },
  { id: "run_018f2a", test: "Search — Typo tolerance v2", status: "done", started: "yesterday", duration: "3m 02s", cost: "$0.52", cases: "9", by: "Devon Park" },
  { id: "run_018f29", test: "Profile — Email change flow", status: "err", started: "yesterday", duration: "1m 18s", cost: "$0.18", cases: "0", by: "Devon Park" },
  { id: "run_018f28", test: "Checkout — Apple Pay rollback", status: "done", started: "3 days ago", duration: "5m 41s", cost: "$0.89", cases: "12", by: "Mira Chen" },
  { id: "run_018f27", test: "Auth — Magic link", status: "done", started: "4 days ago", duration: "2m 49s", cost: "$0.44", cases: "8", by: "Jules Ng" },
]
