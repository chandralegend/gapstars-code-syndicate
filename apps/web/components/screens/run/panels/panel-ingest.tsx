import { Badge } from "@/components/ui/badge"
import { PanelBody, PanelFrame, PanelHead } from "@/components/screens/run/panels/panel-frame"

export function PanelIngest() {
  return (
    <PanelFrame>
      <PanelHead
        num="00"
        title="Ingest & plan"
        desc="Validate context, draft run plan"
        right={<Badge variant="ok">done · 3.1s</Badge>}
      />
      <PanelBody>
        <div className="max-w-[720px]">
          <h2
            className="font-serif text-[26px] leading-tight tracking-[-0.012em]"
            style={{ fontFamily: "var(--font-serif), serif" }}
          >
            Run plan
          </h2>
          <p className="text-ink-2 mt-2 text-[14px] leading-relaxed">
            3-agent graph with two HITL gates. Sandbox: E2B firecracker, 2 vCPU
            / 4 GB.
          </p>
          <h3 className="text-ink-3 mt-6 mb-2 text-[12px] font-semibold tracking-wider uppercase">
            Inputs received
          </h3>
          <ul className="space-y-1.5 text-[13.5px]">
            <li>
              Brief:{" "}
              <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-[12px]">
                tests/saved-carts-cross-device.md
              </code>{" "}
              (2.1 KB)
            </li>
            <li>
              Repo refs:{" "}
              <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-[12px]">
                app/cart/*
              </code>
              ,{" "}
              <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-[12px]">
                api/v2/cart.py
              </code>
              ,{" "}
              <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-[12px]">
                web/CartPage.tsx
              </code>
            </li>
            <li>Personas: 2 (Authenticated shopper, Anonymous shopper)</li>
          </ul>
          <h3 className="text-ink-3 mt-6 mb-2 text-[12px] font-semibold tracking-wider uppercase">
            Graph plan
          </h3>
          <div className="bg-muted rounded-md p-3 font-mono text-[12px] leading-relaxed">
            ingest → agent_1 →{" "}
            <span className="text-accent-ink">interrupt_1</span> → agent_2 →
            agent_3 → <span className="text-accent-ink">interrupt_2</span> → end
          </div>
        </div>
      </PanelBody>
    </PanelFrame>
  )
}
