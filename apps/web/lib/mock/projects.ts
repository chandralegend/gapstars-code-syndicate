import type { Project } from "@/lib/types"

export const PROJECTS: Project[] = [
  {
    id: "shop",
    name: "Acme Shop",
    description: "Direct-to-consumer marketplace for outdoor gear. Web + iOS.",
    stagingUrl: "staging.example.com",
    testsetCount: 5,
    runsThisWeek: 34,
    status: "active",
    createdAt: "12 days ago",
  },
  {
    id: "billing",
    name: "Billing Platform",
    description: "Subscription billing service shared by all Acme products.",
    stagingUrl: "billing.staging.example.com",
    testsetCount: 2,
    runsThisWeek: 7,
    status: "active",
    createdAt: "1 month ago",
  },
  {
    id: "ops",
    name: "Internal Ops Console",
    description: "Customer-support tool for refunds, account merges, and impersonation.",
    stagingUrl: "ops.staging.example.com",
    testsetCount: 0,
    runsThisWeek: 0,
    status: "draft",
    createdAt: "2 days ago",
  },
]

export const DEFAULT_PROJECT_ID = PROJECTS[0]!.id

export function getProject(id: string): Project | undefined {
  return PROJECTS.find((p) => p.id === id)
}
