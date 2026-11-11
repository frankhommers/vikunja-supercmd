import { getPreferenceValues } from "@raycast/api";

export interface Project {
  id: number;
  title: string;
  description: string;
  is_archived: boolean;
  parent_project_id: number | null;
  hex_color: string;
  identifier: string;
}

export interface ProjectInput {
  title: string;
  description?: string;
  parent_project_id?: number | null;
  hex_color?: string;
  identifier?: string;
}

export interface Label {
  id: number;
  title: string;
  hex_color: string;
}

export interface Task {
  id: number;
  title: string;
  description: string;
  priority: number;
  due_date: string | null;
  is_favorite: boolean;
  done: boolean;
  project_id: number;
  labels: Label[];
  created: string;
  updated: string;
}

export interface TaskInput {
  title: string;
  description?: string;
  priority?: number;
  due_date?: string | null;
  is_favorite?: boolean;
}

export function getBaseUrl(): string {
  const { apiUrl } = getPreferenceValues<Preferences>();
  return apiUrl
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/api\/v[12]$/, "");
}

function getApiVersion(): "v1" | "v2" {
  return getPreferenceValues<Preferences>().apiVersion === "v1" ? "v1" : "v2";
}

async function fetchResponse(
  path: string,
  options?: RequestInit,
): Promise<Response> {
  const { apiToken } = getPreferenceValues<Preferences>();
  const version = getApiVersion();
  const url = new URL(`${getBaseUrl()}/api/${version}${path}`);
  if (version === "v2") url.searchParams.set("format", "markdown");
  const response = await fetch(url.toString(), {
    ...options,
    headers: {
      Authorization: `Bearer ${apiToken.trim()}`,
      "Content-Type":
        options?.method === "PATCH"
          ? "application/merge-patch+json"
          : "application/json",
      ...options?.headers,
    },
  });
  if (!response.ok) {
    const body = await response.text();
    let detail = body;
    try {
      const error = JSON.parse(body);
      detail = error.detail || error.message || error.title || body;
    } catch {
      /* A proxy may return plain text instead of JSON. */
    }
    throw new Error(`Vikunja API error (${response.status}): ${detail}`);
  }
  return response;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetchResponse(path, options);
  const text = await response.text();
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

interface Page<T> {
  items: T[];
  total_pages: number;
}

async function requestAll<T>(path: string): Promise<T[]> {
  const items: T[] = [];
  for (let page = 1; ; page++) {
    const separator = path.includes("?") ? "&" : "?";
    const response = await fetchResponse(
      `${path}${separator}page=${page}&per_page=100`,
    );
    const result = (await response.json()) as T[] | Page<T> | null;
    const batch = Array.isArray(result) ? result : (result?.items ?? []);
    items.push(...batch);
    const totalPages =
      result && !Array.isArray(result)
        ? result.total_pages
        : Number(response.headers.get("x-pagination-total-pages")) || undefined;
    if (batch.length === 0 || (totalPages !== undefined && page >= totalPages))
      return items;
    // Without pagination metadata, continue until an empty page. The server may
    // cap per_page below the requested value, so a short page is not sufficient.
  }
}

function createMethod(): string {
  return getApiVersion() === "v2" ? "POST" : "PUT";
}

function updateMethod(): string {
  return getApiVersion() === "v2" ? "PATCH" : "POST";
}

export async function getProjects(includeArchived = false): Promise<Project[]> {
  const projects = await requestAll<Project>(
    `/projects?is_archived=${includeArchived}`,
  );
  return includeArchived ? projects : projects.filter((p) => !p.is_archived);
}

export async function createProject(project: ProjectInput): Promise<Project> {
  return request<Project>("/projects", {
    method: createMethod(),
    body: JSON.stringify({
      ...project,
      parent_project_id: project.parent_project_id ?? 0,
    }),
  });
}

export async function updateProject(
  projectId: number,
  updates: Partial<ProjectInput & { is_archived: boolean }>,
): Promise<Project> {
  return request<Project>(`/projects/${projectId}`, {
    method: updateMethod(),
    body: JSON.stringify({
      ...updates,
      ...(updates.parent_project_id === null ? { parent_project_id: 0 } : {}),
    }),
  });
}

export async function deleteProject(projectId: number): Promise<void> {
  await request(`/projects/${projectId}`, { method: "DELETE" });
}

export async function getLabels(): Promise<Label[]> {
  return requestAll<Label>("/labels");
}

export async function createTask(
  projectId: number,
  task: TaskInput,
): Promise<Task> {
  return request<Task>(`/projects/${projectId}/tasks`, {
    method: createMethod(),
    body: JSON.stringify({
      ...task,
      ...(task.due_date === null ? { due_date: "0001-01-01T00:00:00Z" } : {}),
    }),
  });
}

export async function addLabelToTask(
  taskId: number,
  labelId: number,
): Promise<void> {
  await request(`/tasks/${taskId}/labels`, {
    method: createMethod(),
    body: JSON.stringify({ label_id: labelId }),
  });
}

export async function removeLabelFromTask(
  taskId: number,
  labelId: number,
): Promise<void> {
  await request(`/tasks/${taskId}/labels/${labelId}`, { method: "DELETE" });
}

export async function addLabelsToTask(
  taskId: number,
  labelIds: number[],
): Promise<void> {
  for (const labelId of labelIds) {
    await addLabelToTask(taskId, labelId);
  }
}

export async function updateTaskLabels(
  taskId: number,
  oldLabelIds: number[],
  newLabelIds: number[],
): Promise<void> {
  const toRemove = oldLabelIds.filter((id) => !newLabelIds.includes(id));
  const toAdd = newLabelIds.filter((id) => !oldLabelIds.includes(id));
  for (const labelId of toRemove) {
    await removeLabelFromTask(taskId, labelId);
  }
  for (const labelId of toAdd) {
    await addLabelToTask(taskId, labelId);
  }
}

export async function getProjectTasks(projectId: number): Promise<Task[]> {
  return requestAll<Task>(
    `/projects/${projectId}/tasks?sort_by=done&order_by=asc`,
  );
}

export async function getAllTasks(): Promise<Task[]> {
  return requestAll<Task>("/tasks?sort_by=done&order_by=asc");
}

export async function searchTasks(query: string): Promise<Task[]> {
  return requestAll<Task>(
    `/tasks?${getApiVersion() === "v2" ? "q" : "s"}=${encodeURIComponent(query)}&sort_by=done&order_by=asc`,
  );
}

export async function toggleTaskDone(task: Task): Promise<Task> {
  return request<Task>(`/tasks/${task.id}`, {
    method: updateMethod(),
    body: JSON.stringify({ done: !task.done }),
  });
}

export async function deleteTask(taskId: number): Promise<void> {
  await request(`/tasks/${taskId}`, { method: "DELETE" });
}

export async function updateTask(
  taskId: number,
  updates: Partial<TaskInput & { done: boolean; project_id: number }>,
): Promise<Task> {
  return request<Task>(`/tasks/${taskId}`, {
    method: updateMethod(),
    body: JSON.stringify({
      ...updates,
      ...(updates.due_date === null
        ? { due_date: "0001-01-01T00:00:00Z" }
        : {}),
    }),
  });
}
