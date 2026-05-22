/**
 * Resource-level helpers wrapping the typed openapi-fetch client. These
 * unwrap the `{ data, error }` envelope into either the value or a thrown
 * `ApiError` (the response middleware handles non-2xx already), so callers
 * can `await listProjects()` and treat it like a normal promise.
 */
import {
  apiClient,
  API_URL,
  type ExtendResponse,
  type FeatureExpectation,
  type FeedbackRequest,
  type Project,
  type ProjectCreate,
  type ProjectUpdate,
  type Run,
  type RunCreateResponse,
  type SandboxFileList,
  type SandboxScreenshotList,
  type SandboxStatus,
  type TestCase,
  type TestScenario,
  type TestScenarioCreate,
  type TestScenarioUpdate,
} from "./client"

function unwrap<T>(envelope: { data?: T; error?: unknown }): T {
  if (envelope.error) {
    throw envelope.error instanceof Error
      ? envelope.error
      : new Error(JSON.stringify(envelope.error))
  }
  if (envelope.data === undefined) {
    throw new Error("API returned no data")
  }
  return envelope.data
}

// ── Projects ────────────────────────────────────────────────────────────────

export async function listProjects(): Promise<Project[]> {
  return unwrap(await apiClient.GET("/api/projects"))
}

export async function getProject(projectId: string): Promise<Project> {
  return unwrap(
    await apiClient.GET("/api/projects/{project_id}", {
      params: { path: { project_id: projectId } },
    }),
  )
}

export async function createProject(body: ProjectCreate): Promise<Project> {
  return unwrap(await apiClient.POST("/api/projects", { body }))
}

export async function updateProject(
  projectId: string,
  body: ProjectUpdate,
): Promise<Project> {
  return unwrap(
    await apiClient.PUT("/api/projects/{project_id}", {
      params: { path: { project_id: projectId } },
      body,
    }),
  )
}

export async function deleteProject(projectId: string): Promise<void> {
  await apiClient.DELETE("/api/projects/{project_id}", {
    params: { path: { project_id: projectId } },
  })
}

// ── Test scenarios ──────────────────────────────────────────────────────────

export async function listTestScenarios(
  projectId: string,
): Promise<TestScenario[]> {
  return unwrap(
    await apiClient.GET("/api/projects/{project_id}/test-scenarios", {
      params: { path: { project_id: projectId } },
    }),
  )
}

export async function getTestScenario(
  scenarioId: string,
): Promise<TestScenario> {
  return unwrap(
    await apiClient.GET("/api/test-scenarios/{scenario_id}", {
      params: { path: { scenario_id: scenarioId } },
    }),
  )
}

export async function createTestScenario(
  projectId: string,
  body: TestScenarioCreate,
): Promise<TestScenario> {
  return unwrap(
    await apiClient.POST("/api/projects/{project_id}/test-scenarios", {
      params: { path: { project_id: projectId } },
      body,
    }),
  )
}

export async function updateTestScenario(
  scenarioId: string,
  body: TestScenarioUpdate,
): Promise<TestScenario> {
  return unwrap(
    await apiClient.PUT("/api/test-scenarios/{scenario_id}", {
      params: { path: { scenario_id: scenarioId } },
      body,
    }),
  )
}

export async function deleteTestScenario(scenarioId: string): Promise<void> {
  await apiClient.DELETE("/api/test-scenarios/{scenario_id}", {
    params: { path: { scenario_id: scenarioId } },
  })
}

// ── Runs ────────────────────────────────────────────────────────────────────

export async function createRun(
  scenarioId: string,
): Promise<RunCreateResponse> {
  return unwrap(
    await apiClient.POST("/api/test-scenarios/{scenario_id}/runs", {
      params: { path: { scenario_id: scenarioId } },
    }),
  )
}

export async function listRunsByScenario(
  scenarioId: string,
): Promise<Run[]> {
  return unwrap(
    await apiClient.GET("/api/test-scenarios/{scenario_id}/runs", {
      params: { path: { scenario_id: scenarioId } },
    }),
  )
}

export async function listRunsByProject(projectId: string): Promise<Run[]> {
  return unwrap(
    await apiClient.GET("/api/projects/{project_id}/runs", {
      params: { path: { project_id: projectId } },
    }),
  )
}

export async function getRun(runId: string): Promise<Run> {
  return unwrap(
    await apiClient.GET("/api/runs/{run_id}", {
      params: { path: { run_id: runId } },
    }),
  )
}

export async function submitFeedback(
  runId: string,
  body: FeedbackRequest,
): Promise<Run> {
  return unwrap(
    await apiClient.POST("/api/runs/{run_id}/feedback", {
      params: { path: { run_id: runId } },
      body,
    }),
  )
}

export async function getFeatureExpectation(
  runId: string,
): Promise<FeatureExpectation> {
  return unwrap(
    await apiClient.GET("/api/runs/{run_id}/feature-expectation", {
      params: { path: { run_id: runId } },
    }),
  )
}

export async function getTestCases(runId: string): Promise<TestCase[]> {
  return unwrap(
    await apiClient.GET("/api/runs/{run_id}/test-cases", {
      params: { path: { run_id: runId } },
    }),
  )
}

// ── Sandbox artifacts ───────────────────────────────────────────────────────

export async function listSandboxFiles(
  runId: string,
): Promise<SandboxFileList> {
  return unwrap(
    await apiClient.GET("/api/runs/{run_id}/sandbox/files", {
      params: { path: { run_id: runId } },
    }),
  )
}

export async function readSandboxFile(
  runId: string,
  filePath: string,
): Promise<string> {
  // openapi-fetch returns the parsed body; for text/plain that's the string
  // already. We bypass the typed endpoint here since it's modeled as `unknown`
  // by openapi-typescript for path-templated text responses, and use plain fetch
  // through the same base URL so the file path can contain slashes.
  const url = sandboxFileUrl(runId, filePath)
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(
      `${res.status} ${res.statusText} reading ${filePath}: ${await res.text()}`,
    )
  }
  return await res.text()
}

/**
 * Absolute URL for a sandbox artifact, suitable for an ``<img>`` src.
 *
 * The OpenAPI ``url`` field on screenshots is relative to the API host.
 * The browser bundles the API_URL constant so we just prefix.
 */
export function sandboxFileUrl(runId: string, filePath: string): string {
  return `${API_URL}/api/runs/${runId}/sandbox/files/${filePath
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`
}

export async function listSandboxScreenshots(
  runId: string,
): Promise<SandboxScreenshotList> {
  return unwrap(
    await apiClient.GET("/api/runs/{run_id}/sandbox/screenshots", {
      params: { path: { run_id: runId } },
    }),
  )
}

export async function getSandboxStatus(runId: string): Promise<SandboxStatus> {
  return unwrap(
    await apiClient.GET("/api/runs/{run_id}/sandbox/status", {
      params: { path: { run_id: runId } },
    }),
  )
}

export async function extendSandboxTimeout(
  runId: string,
  extraSeconds: number,
): Promise<ExtendResponse> {
  return unwrap(
    await apiClient.POST("/api/runs/{run_id}/sandbox/extend", {
      params: { path: { run_id: runId } },
      body: { extra_seconds: extraSeconds },
    }),
  )
}
