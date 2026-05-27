"use client"

/**
 * Run report — printable summary of a single run.
 *
 * Pulls the brief, sandbox findings, test cases, latest bundle, and
 * latest test execution into a single long-form document. The page is
 * styled for both screen reading and printing; clicking "Save as PDF"
 * fires `window.print()` and the user picks "Save as PDF" in the
 * browser dialog. No backend rendering required.
 */
import { use, useCallback, useEffect } from "react"
import Link from "next/link"
import { ArrowLeftIcon, DownloadIcon, PrinterIcon } from "lucide-react"

import { PageContainer } from "@/components/shell/page-container"
import { Button } from "@/components/ui/button"
import {
  caseCategoryBadge,
  caseStatusLabel,
  runStatusLabel,
} from "@/lib/labels"
import {
  getFeatureExpectation,
  getLatestScriptBundle,
  getLatestTestExecution,
  getProject,
  getRun,
  getTestCases,
  getTestScenario,
  listSandboxScreenshots,
  readSandboxFile,
  sandboxFileUrl,
  useFetch,
  type FeatureExpectation,
  type Run,
  type TestCase,
} from "@/lib/api"
import { formatAbsolute, formatDuration } from "@/lib/format"
import { useSetBreadcrumbs } from "@/lib/stores/breadcrumbs"

interface PageProps {
  params: Promise<{ projectId: string; runId: string }>
}

export default function RunReportPage({ params }: PageProps) {
  const { projectId, runId } = use(params)

  // Hide the topbar's run-action buttons since this *is* the report.
  useSetBreadcrumbs(
    [
      { label: "Projects", href: "/projects" },
      { label: "…", muted: true },
      {
        label: `Run #${runId.slice(0, 8)}`,
        href: `/projects/${projectId}/runs/${runId}`,
        mono: true,
      },
      { label: "Report" },
    ],
    "default",
  )

  // Pull every artifact in parallel.
  const projectQ = useFetch(
    useCallback(() => getProject(projectId), [projectId]),
    [projectId],
  )
  const runQ = useFetch(
    useCallback(() => getRun(runId), [runId]),
    [runId],
  )
  const scenarioQ = useFetch(
    useCallback(
      async () =>
        runQ.data ? getTestScenario(runQ.data.test_scenario_id) : null,
      [runQ.data],
    ),
    [runQ.data?.test_scenario_id],
  )
  const feQ = useFetch(
    useCallback(() => getFeatureExpectation(runId), [runId]),
    [runId],
  )
  const casesQ = useFetch(
    useCallback(() => getTestCases(runId), [runId]),
    [runId],
  )
  const bundleQ = useFetch(
    useCallback(() => getLatestScriptBundle(runId), [runId]),
    [runId],
  )
  const executionQ = useFetch(
    useCallback(() => getLatestTestExecution(runId), [runId]),
    [runId],
  )
  const screenshotsQ = useFetch(
    useCallback(() => listSandboxScreenshots(runId), [runId]),
    [runId],
  )
  const findingsQ = useFetch(
    useCallback(
      async () =>
        readSandboxFile(runId, "output/workspace/findings.md").catch(
          () => null,
        ),
      [runId],
    ),
    [runId],
  )

  const project = projectQ.data
  const run = runQ.data
  const scenario = scenarioQ.data
  const fe = feQ.data
  const cases = casesQ.data ?? []
  const bundle = bundleQ.data
  const execution = executionQ.data
  const screenshots = screenshotsQ.data?.screenshots ?? []
  const findings = findingsQ.data

  const loading =
    projectQ.loading || runQ.loading || feQ.loading || casesQ.loading

  // Document title for the print dialog.
  useEffect(() => {
    if (!run) return
    const original = document.title
    document.title = `QALoop run report · ${runId.slice(0, 8)}`
    return () => {
      document.title = original
    }
  }, [run, runId])

  return (
    <PageContainer size="default" className="py-6 print:max-w-none print:py-0">
      <PrintStyles />

      {/* Action bar — hidden in print */}
      <div className="text-ink-3 mb-6 flex items-center justify-between print:hidden">
        <Link
          href={`/projects/${projectId}/runs/${runId}`}
          className="hover:text-foreground inline-flex items-center gap-1.5 text-[12.5px]"
        >
          <ArrowLeftIcon className="size-[13px]" />
          Back to run
        </Link>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.print()}
            disabled={loading}
          >
            <PrinterIcon className="size-[13px]" />
            Print
          </Button>
          <Button
            variant="accent"
            size="sm"
            onClick={() => window.print()}
            disabled={loading}
          >
            <DownloadIcon className="size-[13px]" />
            Save as PDF
          </Button>
        </div>
      </div>

      {/* Cover */}
      <header className="border-border mb-8 border-b pb-6">
        <div className="text-ink-3 font-mono text-[11px] uppercase tracking-[0.2em]">
          QALoop run report
        </div>
        <h1 className="mt-2 text-[28px] leading-tight font-semibold tracking-[-0.02em]">
          {scenario?.title ?? "Loading…"}
        </h1>
        <div className="text-ink-3 mt-1 text-[13.5px]">
          {project?.name} · Run #{runId.slice(0, 8)} ·{" "}
          {run ? runStatusLabel(run.status) : "—"}
        </div>
        {run && (
          <div className="text-ink-4 mt-2 font-mono text-[11px]">
            Generated {formatAbsolute(new Date().toISOString())} ·{" "}
            Run started {formatAbsolute(run.created_at)}
          </div>
        )}
      </header>

      {/* Project context */}
      <Section title="Project context">
        <DescriptionList
          items={[
            ["Name", project?.name ?? "—"],
            ["Description", project?.description ?? "—"],
            ["Tech stack", project?.tech_stack ?? "—"],
            ["Target users", project?.target_users ?? "—"],
          ]}
        />
      </Section>

      {/* Brief */}
      {fe && <BriefSection fe={fe} />}

      {/* Sandbox findings + screenshots */}
      <Section title="Sandbox exploration">
        {findings ? (
          <pre className="border-border bg-muted/40 text-foreground rounded-md border p-4 text-[12.5px] leading-relaxed whitespace-pre-wrap">
            {findings}
          </pre>
        ) : (
          <p className="text-ink-3 text-[13px]">
            No findings.md was captured for this run.
          </p>
        )}
        {screenshots.length > 0 && (
          <div className="mt-4">
            <h3 className="text-ink-3 mb-2 text-[11px] font-medium uppercase tracking-wide">
              Screenshots ({screenshots.length})
            </h3>
            <div className="grid grid-cols-2 gap-3 print:grid-cols-1">
              {screenshots.map((s, i) => (
                <figure
                  key={s.path}
                  className="border-border bg-card overflow-hidden rounded-md border"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={sandboxFileUrl(runId, s.path)}
                    alt={`Frame ${i + 1}`}
                    className="block w-full"
                    loading="lazy"
                  />
                  <figcaption className="text-ink-4 px-2 py-1 font-mono text-[10.5px]">
                    Frame {i + 1} · {s.path.split("/").pop()}
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        )}
      </Section>

      {/* Test cases */}
      <Section title={`Test cases (${cases.length})`}>
        {cases.length === 0 ? (
          <p className="text-ink-3 text-[13px]">No test cases were generated.</p>
        ) : (
          <ol className="space-y-3">
            {cases.map((c, i) => (
              <li
                key={c.id}
                className="border-border bg-card rounded-md border p-3"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <div className="flex items-baseline gap-2">
                    <span className="text-ink-4 font-mono text-[11px]">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="text-foreground text-[13.5px] font-medium">
                      {c.title}
                    </span>
                  </div>
                  <div className="text-ink-3 flex shrink-0 items-center gap-2 font-mono text-[10.5px]">
                    <span className="bg-muted rounded px-1.5 py-px">
                      {caseCategoryBadge(c.category)}
                    </span>
                    <span>{caseStatusLabel(c.status)}</span>
                  </div>
                </div>
                {Array.isArray(c.steps) && c.steps.length > 0 && (
                  <ol className="text-ink-2 ml-5 mt-2 list-decimal space-y-0.5 text-[12.5px]">
                    {c.steps.map((s, j) => (
                      <li key={j}>{renderStep(s)}</li>
                    ))}
                  </ol>
                )}
                {c.expected_result && (
                  <p className="text-ink-3 mt-2 text-[12.5px]">
                    <span className="text-ink-4">Expected:</span>{" "}
                    {c.expected_result}
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}
      </Section>

      {/* Bundle summary */}
      {bundle && (
        <Section title="Test scripts">
          <DescriptionList
            items={[
              ["Status", bundle.status],
              ["Framework", bundle.framework ?? "—"],
              ["Language", bundle.language ?? "—"],
              ["Test count", String(bundle.test_count ?? "—")],
              [
                "Generated",
                bundle.finished_at
                  ? formatAbsolute(bundle.finished_at)
                  : "—",
              ],
            ]}
          />
        </Section>
      )}

      {/* Execution */}
      {execution && (
        <Section title="Test execution">
          <DescriptionList
            items={[
              ["Status", execution.status],
              [
                "Duration",
                execution.duration_ms != null
                  ? formatDuration(execution.duration_ms)
                  : "—",
              ],
              [
                "Started",
                execution.started_at
                  ? formatAbsolute(execution.started_at)
                  : "—",
              ],
            ]}
          />
          {execution.summary && (
            <SummaryGrid summary={execution.summary as Record<string, unknown>} />
          )}
        </Section>
      )}

      {/* Footer */}
      <footer className="border-border text-ink-4 mt-12 border-t pt-4 text-center font-mono text-[10.5px]">
        QALoop · Generated from run #{runId.slice(0, 8)}
      </footer>
    </PageContainer>
  )
}

// ── Inline subcomponents ─────────────────────────────────────────────────────

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="mb-8 break-inside-avoid">
      <h2 className="text-ink-3 mb-3 border-b pb-1 font-mono text-[11px] uppercase tracking-[0.2em]">
        {title}
      </h2>
      {children}
    </section>
  )
}

function DescriptionList({ items }: { items: [string, string][] }) {
  return (
    <dl className="grid grid-cols-[140px_1fr] gap-x-4 gap-y-1.5 text-[13px]">
      {items.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-ink-3">{k}</dt>
          <dd className="text-foreground">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

function SummaryGrid({
  summary,
}: {
  summary: Record<string, unknown>
}) {
  const total = Number(summary.total ?? 0)
  const passed = Number(summary.passed ?? 0)
  const failed = Number(summary.failed ?? 0)
  const errored = Number(summary.errored ?? 0)
  const skipped = Number(summary.skipped ?? 0)
  return (
    <div className="mt-3 grid grid-cols-5 gap-3 text-center print:grid-cols-5">
      <Tile label="Total" value={total} />
      <Tile label="Passed" value={passed} tone="ok" />
      <Tile label="Failed" value={failed} tone="err" />
      <Tile label="Errored" value={errored} tone="warn" />
      <Tile label="Skipped" value={skipped} />
    </div>
  )
}

function Tile({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone?: "ok" | "warn" | "err"
}) {
  const color =
    tone === "ok" && value > 0
      ? "text-ok-ink"
      : tone === "warn" && value > 0
        ? "text-warn-ink"
        : tone === "err" && value > 0
          ? "text-err-ink"
          : "text-foreground"
  return (
    <div className="border-border rounded-md border p-2">
      <div className={`text-[20px] font-semibold ${color}`}>{value}</div>
      <div className="text-ink-3 mt-0.5 text-[10.5px] uppercase tracking-wide">
        {label}
      </div>
    </div>
  )
}

function BriefSection({ fe }: { fe: FeatureExpectation }) {
  const c = (fe.content ?? {}) as Record<string, unknown>
  const description = typeof c.feature_description === "string"
    ? c.feature_description
    : null
  const acs = Array.isArray(c.acceptance_criteria)
    ? (c.acceptance_criteria as string[])
    : []
  const edges = Array.isArray(c.edge_cases)
    ? (c.edge_cases as string[])
    : []
  const flows = Array.isArray(c.user_flows) ? c.user_flows : []
  return (
    <Section title={`Feature brief · v${fe.version}`}>
      {description && (
        <p className="text-foreground mb-3 text-[13px] leading-relaxed">
          {description}
        </p>
      )}
      {acs.length > 0 && (
        <>
          <h3 className="text-ink-3 mt-3 mb-1 text-[11px] font-medium uppercase tracking-wide">
            Acceptance criteria
          </h3>
          <ul className="text-foreground ml-5 list-disc space-y-1 text-[12.5px]">
            {acs.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </>
      )}
      {edges.length > 0 && (
        <>
          <h3 className="text-ink-3 mt-3 mb-1 text-[11px] font-medium uppercase tracking-wide">
            Edge cases
          </h3>
          <ul className="text-foreground ml-5 list-disc space-y-1 text-[12.5px]">
            {edges.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </>
      )}
      {flows.length > 0 && (
        <>
          <h3 className="text-ink-3 mt-3 mb-1 text-[11px] font-medium uppercase tracking-wide">
            User flows
          </h3>
          <ol className="space-y-3">
            {(flows as Record<string, unknown>[]).map((f, i) => (
              <li
                key={i}
                className="border-border rounded-md border p-3"
              >
                <div className="text-foreground text-[13px] font-medium">
                  {String(f.name ?? `Flow ${i + 1}`)}
                </div>
                {Array.isArray(f.steps) && (
                  <ol className="text-ink-2 ml-5 mt-1.5 list-decimal space-y-0.5 text-[12.5px]">
                    {(f.steps as unknown[]).map((s, j) => (
                      <li key={j}>{renderStep(s)}</li>
                    ))}
                  </ol>
                )}
                {typeof f.expected_outcome === "string" && (
                  <p className="text-ink-3 mt-2 text-[12.5px]">
                    <span className="text-ink-4">Expected:</span>{" "}
                    {f.expected_outcome}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </>
      )}
    </Section>
  )
}

function renderStep(s: unknown): string {
  if (typeof s === "string") return s
  if (s && typeof s === "object") {
    const o = s as Record<string, unknown>
    if (typeof o.action === "string") {
      return typeof o.expected === "string"
        ? `${o.action}: ${o.expected}`
        : o.action
    }
  }
  return String(s)
}

/**
 * Print-only stylesheet.
 *
 * Hides the app shell (sidebar, topbar, navigation) and gives the
 * report comfortable margins so the printed PDF is just the report.
 */
function PrintStyles() {
  return (
    <style jsx global>{`
      @media print {
        html,
        body {
          background: white !important;
          color: black !important;
        }
        /* Hide everything in the AppShell except the report content. */
        [data-sidebar],
        [data-slot="sidebar"],
        [data-slot="sidebar-trigger"],
        nav,
        header[role="banner"],
        .group\\/sidebar,
        aside[data-slot="sidebar-container"] {
          display: none !important;
        }
        @page {
          size: A4;
          margin: 18mm 14mm;
        }
        a {
          color: inherit !important;
          text-decoration: none !important;
        }
        figure,
        section,
        li {
          break-inside: avoid;
        }
      }
    `}</style>
  )
}
