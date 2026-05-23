/**
 * Tiny typed API client backed by openapi-fetch + the auto-generated
 * `schema.d.ts` (sibling file produced by `bunx openapi-typescript`).
 *
 * Re-export shorthand types so callers don't have to spell out
 * `components["schemas"]["…"]` everywhere.
 */
import createClient, { type Middleware } from "openapi-fetch"

import type { components, paths } from "./schema"

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

const errorMiddleware: Middleware = {
  async onResponse({ response }) {
    if (response.ok) return response
    let detail: string | undefined
    try {
      const body = await response.clone().json()
      detail =
        typeof body?.detail === "string"
          ? body.detail
          : JSON.stringify(body?.detail ?? body)
    } catch {
      detail = await response.clone().text()
    }
    throw new ApiError(
      `${response.status} ${response.statusText}: ${detail ?? "request failed"}`,
      response.status,
      detail,
    )
  },
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public detail?: string,
  ) {
    super(message)
    this.name = "ApiError"
  }
}

export const apiClient = createClient<paths>({ baseUrl: API_URL })
apiClient.use(errorMiddleware)

// ── Convenience type aliases ────────────────────────────────────────────────

export type Schemas = components["schemas"]

export type Project = Schemas["ProjectRead"]
export type ProjectCreate = Schemas["ProjectCreate"]
export type ProjectUpdate = Schemas["ProjectUpdate"]

export type TestScenario = Schemas["TestScenarioRead"]
export type TestScenarioCreate = Schemas["TestScenarioCreate"]
export type TestScenarioUpdate = Schemas["TestScenarioUpdate"]
export type TestScenarioStatus = Schemas["TestScenarioStatus"]

export type Run = Schemas["RunRead"]
export type RunCreateResponse = Schemas["RunCreateResponse"]
export type RunStatus = Schemas["RunStatus"]

export type FeatureExpectation = Schemas["FeatureExpectationRead"]
export type FeatureExpectationStatus = Schemas["FeatureExpectationStatus"]

export type TestCase = Schemas["TestCaseRead"]
export type TestCaseCategory = Schemas["TestCaseCategory"]
export type TestCaseStatus = Schemas["TestCaseStatus"]

export type FeedbackRequest = Schemas["FeedbackRequest"]

export type SandboxFileList = Schemas["SandboxFileList"]
export type SandboxFile = Schemas["SandboxFile"]

export type SandboxScreenshotList = Schemas["SandboxScreenshotList"]
export type SandboxScreenshot = Schemas["SandboxScreenshot"]

export type SandboxStatus = Schemas["SandboxStatus"]
export type ExtendRequest = Schemas["ExtendRequest"]
export type ExtendResponse = Schemas["ExtendResponse"]

export type TestScriptBundle = Schemas["TestScriptBundleRead"]
export type TestScriptBundleStatus = Schemas["TestScriptBundleStatus"]
export type BundleFileList = Schemas["BundleFileList"]

export type TestExecution = Schemas["TestExecutionRead"]
export type TestExecutionDetail = Schemas["TestExecutionDetail"]
export type TestExecutionResult = Schemas["TestExecutionResultRead"]
export type TestExecutionStatus = Schemas["TestExecutionStatus"]
export type TestExecutionTrigger = Schemas["TestExecutionTrigger"]
export type TestOutcome = Schemas["TestOutcome"]

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Server-Sent Events URL for a run. Used with the native `EventSource`.
 */
export function runEventsUrl(runId: string): string {
  return `${API_URL}/api/runs/${runId}/events`
}
