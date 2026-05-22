import type { AgentEvent } from "@/lib/types"

export const EVENT_STREAM: AgentEvent[] = [
  { t: "00:02.1", kind: "thought", msg: "Planning probe: hit /api/cart/active without auth to confirm 401, then with bearer." },
  { t: "00:02.4", kind: "http", msg: "GET /api/cart/active → 401 Unauthorized (12 ms)" },
  { t: "00:03.2", kind: "http", msg: "GET /api/cart/active (bearer) → 200 OK, 314 B (44 ms)" },
  { t: "00:04.0", kind: "tool", msg: "shell › curl -i -X POST /api/cart/save -H 'Idempotency-Key: probe-1'" },
  { t: "00:04.6", kind: "http", msg: "POST /api/cart/save → 200 OK, cart_id=cart_77ab12 (210 ms)" },
  { t: "00:05.1", kind: "thought", msg: "Replay with same Idempotency-Key to confirm dedup." },
  { t: "00:05.3", kind: "http", msg: "POST /api/cart/save → 200 OK, cart_id=cart_77ab12 (id matches ✓)" },
  { t: "00:06.0", kind: "fs", msg: "wrote outputs/findings.md (1.2 KB)" },
  { t: "00:06.9", kind: "tool", msg: "browser › open http://localhost:5173/cart" },
  { t: "00:08.2", kind: "thought", msg: "UI shows 'Save cart' button only when ≥1 item. Adding SKU to probe state." },
  { t: "00:09.0", kind: "tool", msg: "browser › click 'Add to cart' on SKU-A4421" },
  { t: "00:09.4", kind: "fs", msg: "wrote outputs/artifacts/screenshot-01.png (78 KB)" },
  { t: "00:10.1", kind: "tool", msg: "shell › node merge-stress.js --items 500" },
  { t: "00:11.7", kind: "http", msg: "POST /api/cart/merge → 200 OK in 1.9 s" },
  { t: "00:12.4", kind: "thought", msg: "Trying race: two parallel POST /cart/save with different keys, 150ms apart." },
  { t: "00:12.9", kind: "http", msg: "POST /api/cart/save → 200 OK, cart_id=cart_77ab13" },
  { t: "00:13.0", kind: "http", msg: "POST /api/cart/save → 200 OK, cart_id=cart_77ab14  ⚠ second cart created" },
  { t: "00:13.5", kind: "fs", msg: "appended outputs/findings.md (+312 B) — flagged risk #1" },
]
