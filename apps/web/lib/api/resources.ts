/**
 * Resource-level helpers wrapping the typed openapi-fetch client. These
 * unwrap the `{ data, error }` envelope into either the value or a thrown
 * `ApiError` (the response middleware handles non-2xx already), so callers
 * can `await listProjects()` and treat it like a normal promise.
 */
import {
  apiClient,
  API_URL,
  type BundleFileList,
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
  type TestExecution,
  type TestExecutionDetail,
  type TestScenario,
  type TestScenarioCreate,
  type TestScenarioUpdate,
  type TestScriptBundle,
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

// ── Test-script bundles (Agent 4) ───────────────────────────────────────────

export async function generateTestScripts(
  runId: string,
): Promise<TestScriptBundle> {
  return unwrap(
    await apiClient.POST("/api/runs/{run_id}/scripts", {
      params: { path: { run_id: runId } },
    }),
  )
}

export async function getLatestScriptBundle(
  runId: string,
): Promise<TestScriptBundle | null> {
  const res = await apiClient.GET("/api/runs/{run_id}/scripts/latest", {
    params: { path: { run_id: runId } },
  })
  if (res.error) {
    // Treat 404 as "no bundle yet" so callers can render an empty state
    // without an error toast.
    const status =
      typeof res.error === "object" && res.error
        ? (res.error as { status?: number }).status
        : undefined
    if (status === 404) return null
    throw res.error instanceof Error
      ? res.error
      : new Error(JSON.stringify(res.error))
  }
  return res.data ?? null
}

export async function listScriptBundles(
  runId: string,
): Promise<TestScriptBundle[]> {
  return unwrap(
    await apiClient.GET("/api/runs/{run_id}/scripts", {
      params: { path: { run_id: runId } },
    }),
  )
}

export async function listScriptBundleFiles(
  runId: string,
): Promise<BundleFileList> {
  return unwrap(
    await apiClient.GET("/api/runs/{run_id}/scripts/latest/files", {
      params: { path: { run_id: runId } },
    }),
  )
}

export async function readScriptBundleFile(
  runId: string,
  filePath: string,
): Promise<string> {
  // Strip the workspace prefix the API automatically prepends.
  const stripped = filePath.replace(/^output\/workspace\//, "")
  const url = `${API_URL}/api/runs/${runId}/scripts/latest/files/${stripped
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(
      `${res.status} ${res.statusText} reading ${filePath}: ${await res.text()}`,
    )
  }
  return await res.text()
}

export function scriptBundleDownloadUrl(runId: string): string {
  return `${API_URL}/api/runs/${runId}/scripts/latest/download`
}

// ── Test executions ─────────────────────────────────────────────────────────

export async function listTestExecutions(
  runId: string,
): Promise<TestExecution[]> {
  return unwrap(
    await apiClient.GET("/api/runs/{run_id}/executions", {
      params: { path: { run_id: runId } },
    }),
  )
}

export async function getLatestTestExecution(
  runId: string,
): Promise<TestExecution | null> {
  const res = await apiClient.GET("/api/runs/{run_id}/executions/latest", {
    params: { path: { run_id: runId } },
  })
  if (res.error) {
    const status =
      typeof res.error === "object" && res.error
        ? (res.error as { status?: number }).status
        : undefined
    // Treat 404 as "no execution yet" so callers render an empty state.
    if (status === 404) return null
    throw res.error instanceof Error
      ? res.error
      : new Error(JSON.stringify(res.error))
  }
  return res.data ?? null
}

export async function getTestExecution(
  executionId: string,
): Promise<TestExecutionDetail> {
  return unwrap(
    await apiClient.GET("/api/executions/{execution_id}", {
      params: { path: { execution_id: executionId } },
    }),
  )
}

export async function createTestExecution(
  runId: string,
): Promise<TestExecution> {
  return unwrap(
    await apiClient.POST("/api/runs/{run_id}/executions", {
      params: { path: { run_id: runId } },
    }),
  )
}

export async function cancelTestExecution(
  executionId: string,
): Promise<TestExecution> {
  return unwrap(
    await apiClient.DELETE("/api/executions/{execution_id}", {
      params: { path: { execution_id: executionId } },
    }),
  )
}

/**
 * Direct URL to a per-execution artifact (typically a screenshot under
 * output/reports/screenshots/...). Bypasses the client envelope so it
 * can be used in <img src> directly.
 */
export function executionArtifactUrl(
  executionId: string,
  path: string,
): string {
  const segments = path.split("/").map(encodeURIComponent).join("/")
  return `${API_URL}/api/executions/${executionId}/artifacts/${segments}`
}
