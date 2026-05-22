import { cn } from "@/lib/utils"

type Line = { t: string; lvl: "info" | "ok" | "err" | "pass" | "wait"; m: string }

const LINES: Line[] = [
  { t: "00:00.00", lvl: "info", m: "Test started · playwright 1.46 · chromium 124" },
  { t: "00:00.18", lvl: "ok", m: "context.userA loaded from fixtures/userA.json" },
  { t: "00:00.42", lvl: "info", m: "page.goto /cart → 200 OK in 234 ms" },
  { t: "00:01.10", lvl: "info", m: "getByTestId(sku-A4421).click()" },
  { t: "00:01.34", lvl: "info", m: "POST /api/cart/add → 200 OK in 89 ms" },
  { t: "00:01.92", lvl: "info", m: "button[name=Save cart].click()" },
  { t: "00:02.18", lvl: "info", m: "POST /api/cart/save → 200 OK · cart_id=cart_77ab12" },
  { t: "00:02.41", lvl: "ok", m: "expect 'Cart saved' visible ✓" },
  { t: "00:02.89", lvl: "info", m: "context.iOS loaded; page.goto /cart" },
  { t: "00:03.46", lvl: "info", m: "GET /api/cart/active → 200 OK · 1 item" },
  { t: "00:03.81", lvl: "ok", m: "expect 'sku-A4421' visible ✓" },
  { t: "00:03.92", lvl: "ok", m: "expect 'Cart restored' visible ✓" },
]

const LVL_COLOR: Record<string, string> = {
  ok: "text-ok-ink",
  pass: "text-ok",
  err: "text-err",
  info: "text-info-ink",
  wait: "text-warn-ink",
}

export function ScriptLogs({ running }: { running: boolean }) {
  return (
    <div className="bg-card h-full overflow-auto p-5 font-mono text-[12px]">
      {LINES.map((l, i) => (
        <div key={i} className="flex gap-2.5 py-px">
          <span className="text-ink-4">{l.t}</span>
          <span className={cn("w-12 shrink-0 font-semibold", LVL_COLOR[l.lvl])}>
            {l.lvl.toUpperCase()}
          </span>
          <span className="text-ink-2">{l.m}</span>
        </div>
      ))}
      {!running && (
        <div className="flex gap-2.5 py-px">
          <span className="text-ink-4">00:04.04</span>
          <span className="text-ok w-12 shrink-0 font-semibold">PASS</span>
          <span className="text-ok-ink font-semibold">PASSED in 4.04 s</span>
        </div>
      )}
      {running && (
        <div className="mt-1 flex gap-2.5 py-px">
          <span className="text-ink-4">00:04.1+</span>
          <span className={cn("w-12 shrink-0 font-semibold", LVL_COLOR.wait)}>WAIT</span>
          <span
            className="bg-ink-4 h-3 w-[3px] opacity-70"
            style={{ animation: "probe-caret 0.9s infinite" }}
          />
        </div>
      )}
    </div>
  )
}
