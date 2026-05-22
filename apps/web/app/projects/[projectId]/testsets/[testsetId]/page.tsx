"use client"

import { use } from "react"
import { useRouter } from "next/navigation"
import { notFound } from "next/navigation"
import {
  ActivityIcon,
  ChevronRightIcon,
  CodeIcon,
  DownloadIcon,
  FileTextIcon,
  PlayIcon,
  TestTubeIcon,
} from "lucide-react"

import { CapLine } from "@/components/probe/cap-line"
import { PageHead } from "@/components/probe/page-head"
import { StatCard } from "@/components/probe/stat-card"
import { StatusDot } from "@/components/probe/status-dot"
import { Tag } from "@/components/probe/tag"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { FEATURE_SPEC } from "@/lib/mock/feature-spec"
import { getProject } from "@/lib/mock/projects"
import { RECENT_RUNS } from "@/lib/mock/recent-runs"
import { SCRIPTS } from "@/lib/mock/scripts"
import { TEST_CASES } from "@/lib/mock/test-cases"
import { TESTS } from "@/lib/mock/tests"
import { useSetBreadcrumbs } from "@/lib/stores/breadcrumbs"

const RUN_STATUS_MAP = {
  running: { kind: "running" as const, label: "running" },
  done: { kind: "done" as const, label: "done" },
  err: { kind: "err" as const, label: "error" },
}

export default function TestsetDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; testsetId: string }>
}) {
  const { projectId, testsetId } = use(params)
  const router = useRouter()
  const project = getProject(projectId)
  // Demo: mock data only attached to the first project.
  const testset =
    project?.id === "shop"
      ? TESTS.find((t) => t.id === testsetId)
      : undefined

  useSetBreadcrumbs(
    project && testset
      ? [
          { label: "Projects", href: "/projects" },
          { label: project.name, href: `/projects/${project.id}` },
          {
            label: "Test sets",
            href: `/projects/${project.id}/testsets`,
            muted: true,
          },
          { label: testset.name },
        ]
      : [{ label: "Projects", href: "/projects" }],
  )

  if (!project || !testset) notFound()

  return (
    <>
      <PageHead
        title={testset.name}
        sub={
          <span className="flex items-center gap-2">
            <Badge variant={testset.status === "passed" ? "ok" : testset.status === "failed" ? "err" : "accent"}>
              {testset.status}
            </Badge>
            <span>{testset.desc}</span>
          </span>
        }
        actions={
          <Button
            variant="accent"
            onClick={() =>
              router.push(`/projects/${project.id}/runs/run_018f2c`)
            }
          >
            <PlayIcon className="size-[12px]" />
            New run
          </Button>
        }
      />

      <div className="mx-auto max-w-[1200px] px-6 py-6">
        <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-3">
          <StatCard
            label="Cases"
            value={String(testset.cases)}
            delta={`${TEST_CASES.filter((c) => c.priority === "P0").length} P0`}
          />
          <StatCard
            label="Scripts"
            value={String(testset.scripts)}
            delta={`${SCRIPTS.filter((s) => s.status === "passed").length} passing`}
            deltaKind="up"
          />
          <StatCard label="Runs" value={String(testset.runs)} delta="lifetime" />
        </div>

        <Tabs defaultValue="spec">
          <TabsList className="border-border mb-5 h-auto justify-start gap-1 rounded-none border-b bg-transparent px-0 py-0">
            <Tab value="spec" icon={<FileTextIcon className="size-[13px]" />}>
              Specification
            </Tab>
            <Tab value="cases" icon={<TestTubeIcon className="size-[13px]" />}>
              Cases
              <span className="bg-muted text-ink-3 ml-1.5 rounded-[3px] px-1.5 py-px font-mono text-[10px]">
                {TEST_CASES.length}
              </span>
            </Tab>
            <Tab value="scripts" icon={<CodeIcon className="size-[13px]" />}>
              Scripts
              <span className="bg-muted text-ink-3 ml-1.5 rounded-[3px] px-1.5 py-px font-mono text-[10px]">
                {SCRIPTS.length}
              </span>
            </Tab>
            <Tab value="runs" icon={<ActivityIcon className="size-[13px]" />}>
              Runs
            </Tab>
          </TabsList>

          <TabsContent value="spec" className="mt-0">
            <SpecTab />
          </TabsContent>

          <TabsContent value="cases" className="mt-0">
            <CasesTab />
          </TabsContent>

          <TabsContent value="scripts" className="mt-0">
            <ScriptsTab projectId={project.id} />
          </TabsContent>

          <TabsContent value="runs" className="mt-0">
            <RunsTab projectId={project.id} router={router} />
          </TabsContent>
        </Tabs>
      </div>
    </>
  )
}

function Tab({
  value,
  icon,
  children,
}: {
  value: string
  icon?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <TabsTrigger
      value={value}
      className="text-ink-3 data-[state=active]:text-foreground data-[state=active]:border-foreground hover:text-foreground gap-1.5 rounded-none border-b-2 border-transparent bg-transparent px-3 py-2.5 text-[12.5px] data-[state=active]:bg-transparent data-[state=active]:shadow-none"
    >
      {icon}
      {children}
    </TabsTrigger>
  )
}

/* ────────────────────────────  Spec  ──────────────────────────── */

function SpecTab() {
  const spec = FEATURE_SPEC
  return (
    <div className="border-border bg-card max-w-[820px] space-y-5 rounded-lg border p-6">
      <header>
        <h2
          className="font-serif text-[28px] leading-tight tracking-[-0.015em]"
          style={{ fontFamily: "var(--font-serif), serif" }}
        >
          {spec.title}
        </h2>
        <p className="text-ink-2 mt-2 text-[14.5px] leading-relaxed">
          {spec.lede}
        </p>
      </header>

      <Section title="What this feature does">
        <ul className="space-y-1.5 pl-5 text-[13.5px]">
          {spec.what.map((t, i) => (
            <li key={i} className="list-disc">
              {t}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="User flows">
        <ul className="space-y-1.5 pl-5 text-[13.5px]">
          {spec.flows.map((t, i) => (
            <li key={i} className="list-disc">
              {t}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Data contracts">
        <ul className="space-y-1.5 pl-5 text-[13px]">
          {spec.contracts.map((t, i) => (
            <li key={i} className="list-disc">
              <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-[12px]">
                {t}
              </code>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Acceptance criteria">
        <div className="space-y-2">
          {spec.acceptance.map((t, i) => (
            <div
              key={i}
              className="border-border bg-background flex items-start gap-3 rounded-md border p-3"
            >
              <span className="bg-foreground text-background mt-0.5 shrink-0 rounded-[4px] px-1.5 py-0.5 font-mono text-[10.5px] font-semibold">
                AC{i + 1}
              </span>
              <span className="text-[13px]">{t}</span>
            </div>
          ))}
        </div>
      </Section>
    </div>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section>
      <h3
        className="font-serif text-[18px] leading-tight tracking-[-0.005em]"
        style={{ fontFamily: "var(--font-serif), serif" }}
      >
        {title}
      </h3>
      <div className="mt-2">{children}</div>
    </section>
  )
}

/* ────────────────────────────  Cases  ──────────────────────────── */

function CasesTab() {
  return (
    <div className="space-y-2">
      <CapLine className="mb-2">accepted cases</CapLine>
      {TEST_CASES.map((tc) => (
        <div
          key={tc.id}
          className="border-border bg-card grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-md border px-3 py-2.5"
        >
          <span className="bg-muted text-ink-3 rounded-[3px] px-1.5 py-0.5 font-mono text-[10.5px]">
            {tc.id}
          </span>
          <div className="min-w-0">
            <div className="text-[13.5px] font-medium">
              {tc.title}{" "}
              <span className="ml-1.5 align-middle">
                <Tag>{tc.priority}</Tag>
              </span>
            </div>
            <div className="text-ink-3 mt-0.5 text-[12.5px]">{tc.desc}</div>
          </div>
          <Badge
            variant={
              tc.kind === "happy" ? "ok" : tc.kind === "edge" ? "warn" : "info"
            }
          >
            {tc.kind}
          </Badge>
        </div>
      ))}
    </div>
  )
}

/* ────────────────────────────  Scripts  ──────────────────────────── */

function ScriptsTab({ projectId }: { projectId: string }) {
  return (
    <div className="space-y-2">
      <div className="mb-2 flex items-end justify-between">
        <CapLine>generated scripts</CapLine>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            void projectId
          }}
        >
          <DownloadIcon className="size-[13px]" />
          Export
        </Button>
      </div>
      {SCRIPTS.map((s) => (
        <div
          key={s.id}
          className="border-border bg-card grid grid-cols-[auto_1fr_auto] items-center gap-4 rounded-md border px-4 py-3"
        >
          <Tag>{s.lang}</Tag>
          <div className="min-w-0">
            <div className="truncate text-[13.5px] font-medium">{s.name}</div>
            <div className="text-ink-3 mt-0.5 text-[12px]">
              <span className="font-mono">{s.id}</span>
              {" · "}last run {s.lastRun}
              {" · "}
              {s.status === "passed" && (
                <span className="text-ok-ink">passed in {s.duration}</span>
              )}
              {s.status === "failed" && (
                <span className="text-err">failed in {s.duration}</span>
              )}
              {s.status === "draft" && (
                <span className="text-ink-4">draft</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {s.status === "passed" && <Badge variant="ok">passed</Badge>}
            {s.status === "failed" && <Badge variant="err">failed</Badge>}
            {s.status === "draft" && <Badge variant="muted">draft</Badge>}
          </div>
        </div>
      ))}
    </div>
  )
}

/* ────────────────────────────  Runs  ──────────────────────────── */

function RunsTab({
  projectId,
  router,
}: {
  projectId: string
  router: ReturnType<typeof useRouter>
}) {
  return (
    <div>
      <CapLine className="mb-2">runs of this test set</CapLine>
      <div className="border-border bg-card overflow-hidden rounded-lg border">
        <table className="w-full text-[13px]">
          <thead className="text-ink-3 bg-muted/40 text-left text-[11px] tracking-wider uppercase">
            <tr>
              <th className="px-4 py-2.5">Run</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5">Started</th>
              <th className="px-4 py-2.5">Duration</th>
              <th className="px-4 py-2.5">Cases</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {RECENT_RUNS.map((r) => {
              const s = RUN_STATUS_MAP[r.status]
              return (
                <tr
                  key={r.id}
                  className="border-border hover:bg-muted/40 cursor-pointer border-t"
                  onClick={() =>
                    router.push(`/projects/${projectId}/runs/${r.id}`)
                  }
                >
                  <td className="px-4 py-2.5 font-mono text-[12px]">{r.id}</td>
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-2">
                      <StatusDot kind={s.kind} />
                      {s.label}
                    </span>
                  </td>
                  <td className="text-ink-3 px-4 py-2.5">{r.started}</td>
                  <td className="px-4 py-2.5 font-mono">{r.duration}</td>
                  <td className="px-4 py-2.5 font-mono">{r.cases}</td>
                  <td className="px-4 py-2.5 text-right">
                    <Button variant="ghost" size="sm">
                      Open
                      <ChevronRightIcon className="size-[12px]" />
                    </Button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
