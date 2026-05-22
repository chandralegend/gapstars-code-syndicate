type Token = { c: string; k?: string }
type Line = { c?: string; k?: string; p?: Token[] }

const SRC: Line[] = [
  { c: "// TC-001 · Save and restore on the same account", k: "com" },
  { c: "// Auto-generated from FeatureExpectation v2 (cart_save.v2.hash)", k: "com" },
  { c: "" },
  { p: [{ k: "kw", c: "import" }, { c: " { test, expect } " }, { k: "kw", c: "from" }, { c: " " }, { k: "str", c: "'@playwright/test'" }, { c: ";" }] },
  { c: "" },
  { p: [{ k: "kw", c: "test" }, { c: "(" }, { k: "str", c: "'cart restores across devices'" }, { c: ", " }, { k: "kw", c: "async" }, { c: " ({ browser }) => {" }] },
  { c: "  const userA = await browser.newContext({ storageState: 'fixtures/userA.json' });" },
  { c: "  const web = await userA.newPage();" },
  { p: [{ c: "  await web.goto(" }, { k: "str", c: "'/cart'" }, { c: ");" }] },
  { p: [{ c: "  await web.getByTestId(" }, { k: "str", c: "'sku-A4421'" }, { c: ").click();" }] },
  { p: [{ c: "  await web.getByRole(" }, { k: "str", c: "'button'" }, { c: ", { name: 'Save cart' }).click();" }] },
  { p: [{ c: "  " }, { k: "kw", c: "await" }, { c: " " }, { k: "fn", c: "expect" }, { c: "(web.getByText(" }, { k: "str", c: "'Cart saved'" }, { c: ")).toBeVisible();" }] },
  { c: "" },
  { c: "  const ios = await browser.newContext({ storageState: 'fixtures/userA.json', userAgent: UA_IOS });" },
  { c: "  const app = await ios.newPage();" },
  { p: [{ c: "  await app.goto(" }, { k: "str", c: "'/cart'" }, { c: ");" }] },
  { p: [{ c: "  " }, { k: "kw", c: "await" }, { c: " " }, { k: "fn", c: "expect" }, { c: "(app.getByTestId(" }, { k: "str", c: "'sku-A4421'" }, { c: ")).toBeVisible();" }] },
  { p: [{ c: "  await expect(app.getByText(" }, { k: "str", c: "'Cart restored'" }, { c: ")).toBeVisible();" }] },
  { c: "});" },
]

const COLOR: Record<string, string> = {
  com: "text-ink-4 italic",
  kw: "text-info-ink",
  str: "text-ok-ink",
  fn: "text-accent-ink",
}

export function ScriptCode() {
  return (
    <pre className="bg-card h-full overflow-auto p-5 font-mono text-[12.5px] leading-[1.7]">
      <code>
        {SRC.map((line, i) => (
          <div key={i} className="min-h-[1.7em]">
            {line.p
              ? line.p.map((t, j) => (
                  <span key={j} className={t.k ? COLOR[t.k] : ""}>
                    {t.c}
                  </span>
                ))
              : (
                  <span className={line.k ? COLOR[line.k] : ""}>{line.c}</span>
                )}
          </div>
        ))}
      </code>
    </pre>
  )
}
