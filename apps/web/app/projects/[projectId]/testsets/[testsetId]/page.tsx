"use client"

import { use, useCallback } from "react"
import { useRouter } from "next/navigation"
import { ChevronRightIcon, PlayIcon } from "lucide-react"
import { toast } from "sonner"

import { CapLine } from "@/components/probe/cap-line"
import { PageHead } from "@/components/probe/page-head"
import { RunStatusBadge } from "@/components/probe/run-status-badge"
import { StatCard } from "@/components/probe/stat-card"
import { PageContainer } from "@/components/shell/page-container"
import { Button } from "@/components/ui/button"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import {
  createRun,
  getProject,
  getTestScenario,
  listRunsByScenario,
  useFetch,
  useMutation,
} from "@/lib/api"
import { RelativeTime } from "@/lib/format"
import { nodeLabel } from "@/lib/labels"
import { useSetBreadcrumbs } from "@/lib/stores/breadcrumbs"

export default function TestsetDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; testsetId: string }>
}) {
  const { projectId, testsetId } = use(params)
  const router = useRouter()

  const projectQ = useFetch(
    useCallback(() => getProject(projectId), [projectId]),
    [projectId],
  )
  const scenarioQ = useFetch(
    useCallback(() => getTestScenario(testsetId), [testsetId]),
    [testsetId],
  )
  const runsQ = useFetch(
    useCallback(() => listRunsByScenario(testsetId), [testsetId]),
    [testsetId],
  )

  const project = projectQ.data
  const scenario = scenarioQ.data
  const runs = runsQ.data ?? []

  useSetBreadcrumbs(
    project && scenario
      ? [
          { label: "Projects", href: "/projects" },
          { label: project.name, href: `/projects/${project.id}` },
          {
            label: "Feature tests",
            href: `/projects/${project.id}/testsets`,
            muted: true,
          },
          { label: scenario.title },
        ]
      : [{ label: "Projects", href: "/projects" }],
  )

  const kickoff = useMutation(
    useCallback(async () => {
      const r = await createRun(testsetId)
      return r
    }, [testsetId]),
  )

  if (scenarioQ.error) {
    return (
      <div className="px-6 py-10 text-center">
        <h1 className="text-[20px] font-semibold">Feature test not found</h1>
        <p className="text-ink-3 mt-1 text-[13px]">{scenarioQ.error.message}</p>
      </div>
    )
  }
  if (!project || !scenario) {
    return <div className="text-ink-3 px-6 py-10 text-[13px]">Loading…</div>
  }

  const handleNewRun = async () => {
    try {
      const r = await kickoff.run()
      toast.success("Run started")
      router.push(`/projects/${project.id}/runs/${r.run_id}`)
    } catch (e) {
      toast.error(`Could not start run: ${e instanceof Error ? e.message : e}`)
    }
  }

  return (
    <PageContainer>
      <PageHead
        title={scenario.title}
        sub={scenario.feature_description}
        actions={
          <Button
            variant="accent"
            onClick={handleNewRun}
            disabled={kickoff.loading}
          >
            <PlayIcon className="size-[12px]" />
            {kickoff.loading ? "Starting…" : "Start a new run"}
          </Button>
        }
      />

      <div className="py-6">
        <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-3">
          <StatCard label="Status" value={scenario.status} />
          <StatCard label="Runs" value={String(runs.length)} delta="lifetime" />
          <StatCard
            label="Created"
            value={new Date(scenario.created_at).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
          />
        </div>

        <Tabs defaultValue="brief">
          <TabsList className="border-border mb-5 h-auto justify-start gap-1 rounded-none border-b bg-transparent px-0 py-0">
            <Tab value="brief">Brief</Tab>
            <Tab value="runs">
              Runs
              <span className="bg-muted text-ink-3 ml-1.5 rounded-[3px] px-1.5 py-px font-mono text-[10px]">
                {runs.length}
              </span>
            </Tab>
          </TabsList>

          <TabsContent value="brief" className="mt-0">
            <BriefTab scenario={scenario} />
          </TabsContent>

          <TabsContent value="runs" className="mt-0">
            {runs.length === 0 ? (
              <div className="border-border bg-card rounded-lg border border-dashed py-12 text-center">
                <div className="text-ink-3 text-[13px]">
                  No runs yet for this feature test.
                </div>
                <Button
                  variant="accent"
                  className="mt-4"
                  onClick={handleNewRun}
                  disabled={kickoff.loading}
                >
                  <PlayIcon className="size-[12px]" />
                  Start the first run
                </Button>
              </div>
            ) : (
              <div className="border-border bg-card overflow-hidden rounded-lg border">
                <table className="w-full text-[13px]">
                  <thead className="text-ink-3 bg-muted/40 text-left text-[11px] tracking-wider uppercase">
                    <tr>
                      <th className="px-4 py-2.5">Run</th>
                      <th className="px-4 py-2.5">Status</th>
                      <th className="px-4 py-2.5">Step</th>
                      <th className="px-4 py-2.5">Started</th>
                      <th className="px-4 py-2.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((r) => (
                      <tr
                        key={r.id}
                        className="border-border hover:bg-muted/40 cursor-pointer border-t"
                        onClick={() =>
                          router.push(`/projects/${project.id}/runs/${r.id}`)
                        }
                      >
                        <td className="px-4 py-2.5 font-mono text-[12px]">
                          #{r.id.slice(0, 8)}
                        </td>
                        <td className="px-4 py-2.5">
                          <RunStatusBadge status={r.status} />
                        </td>
                        <td className="text-ink-3 px-4 py-2.5 text-[12.5px]">
                          {r.current_node ? nodeLabel(r.current_node) : "—"}
                        </td>
                        <td className="text-ink-3 px-4 py-2.5">
                          <RelativeTime iso={r.created_at} />
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <Button variant="ghost" size="sm">
                            Open
                            <ChevronRightIcon className="size-[12px]" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </PageContainer>
  )
}

function Tab({
  value,
  children,
}: {
  value: string
  children: React.ReactNode
}) {
  return (
    <TabsTrigger
      value={value}
      className="text-ink-3 data-[state=active]:text-foreground data-[state=active]:border-foreground hover:text-foreground gap-1.5 rounded-none border-b-2 border-transparent bg-transparent px-3 py-2.5 text-[12.5px] data-[state=active]:bg-transparent data-[state=active]:shadow-none"
    >
      {children}
    </TabsTrigger>
  )
}

function BriefTab({
  scenario,
}: {
  scenario: { feature_description: string; user_story: string; acceptance_criteria: string }
}) {
  return (
    <div className="border-border bg-card max-w-[820px] space-y-5 rounded-lg border p-6">
      <Section title="What this feature does">
        <p className="whitespace-pre-wrap text-[13.5px]">
          {scenario.feature_description}
        </p>
      </Section>
      <Section title="User story">
        <p className="whitespace-pre-wrap text-[13.5px]">{scenario.user_story}</p>
      </Section>
      <Section title="What needs to be true to pass">
        <pre className="whitespace-pre-wrap font-mono text-[12.5px]">
          {scenario.acceptance_criteria}
        </pre>
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
      <CapLine className="mb-2">{title}</CapLine>
      <div>{children}</div>
    </section>
  )
}
