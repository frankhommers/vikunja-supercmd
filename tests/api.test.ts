import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { preferences } = vi.hoisted(() => ({
  preferences: {
    apiUrl: "https://tasks.example.com",
    apiToken: "test-token",
    apiVersion: "v2",
  },
}));
vi.mock("@raycast/api", () => ({ getPreferenceValues: () => preferences }));
import {
  addLabelToTask,
  createProject,
  createTask,
  deleteProject,
  deleteTask,
  getAllTasks,
  getBaseUrl,
  getLabels,
  getProjects,
  getProjectTasks,
  removeLabelFromTask,
  searchTasks,
  toggleTaskDone,
  updateProject,
  updateTask,
  type Task,
} from "../src/api";

const fetchMock = vi.fn<typeof fetch>();
const json = (body: unknown, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), { headers });
const url = (call = 0) => new URL(String(fetchMock.mock.calls[call][0]));

beforeEach(() => {
  preferences.apiUrl = "https://tasks.example.com";
  preferences.apiVersion = "v2";
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("Vikunja 2.8 API v2", () => {
  it("loads all pages even when the server caps page size", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ items: [{ id: 1 }], total_pages: 2 }))
      .mockResolvedValueOnce(json({ items: [{ id: 2 }], total_pages: 2 }));
    expect(await getAllTasks()).toEqual([{ id: 1 }, { id: 2 }]);
    expect(url().pathname).toBe("/api/v2/tasks");
    expect(url(1).searchParams.get("page")).toBe("2");
    expect(url().searchParams.get("format")).toBe("markdown");
  });
  it("uses q for search and preserves special characters", async () => {
    fetchMock.mockResolvedValue(json({ items: [], total_pages: 0 }));
    await searchTasks("A & B + ü");
    expect(url().searchParams.get("q")).toBe("A & B + ü");
    expect(url().searchParams.has("s")).toBe(false);
  });
  it("scopes task lists to the selected project", async () => {
    fetchMock.mockResolvedValue(json({ items: [], total_pages: 0 }));
    await getProjectTasks(42);
    expect(url().pathname).toBe("/api/v2/projects/42/tasks");
  });
  it("creates tasks, projects and label assignments with POST", async () => {
    fetchMock.mockImplementation(async () => json({ id: 1 }));
    await createTask(42, { title: "New" });
    await createProject({ title: "Project" });
    await addLabelToTask(1, 7);
    expect(fetchMock.mock.calls.map(([, init]) => init?.method)).toEqual([
      "POST",
      "POST",
      "POST",
    ]);
    expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body))).toEqual({
      label_id: 7,
    });
  });
  it("uses merge PATCH for partial updates without replacing other fields", async () => {
    fetchMock.mockImplementation(async () => json({ id: 1 }));
    await updateTask(1, { is_favorite: true });
    await updateProject(42, { is_archived: true });
    await toggleTaskDone({ id: 1, done: false } as Task);
    for (const [, init] of fetchMock.mock.calls) {
      expect(init?.method).toBe("PATCH");
      expect(init?.headers).toHaveProperty(
        "Content-Type",
        "application/merge-patch+json",
      );
    }
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      is_favorite: true,
    });
    expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body))).toEqual({
      done: true,
    });
  });
  it("accepts empty 204 deletion responses", async () => {
    fetchMock.mockImplementation(
      async () => new Response(null, { status: 204 }),
    );
    await expect(deleteTask(1)).resolves.toBeUndefined();
    await expect(deleteProject(2)).resolves.toBeUndefined();
    await expect(removeLabelFromTask(1, 2)).resolves.toBeUndefined();
  });
  it("requests archived projects explicitly", async () => {
    fetchMock.mockImplementation(async () =>
      json({ items: [{ id: 1, is_archived: true }], total_pages: 1 }),
    );
    expect(await getProjects()).toEqual([]);
    expect(await getProjects(true)).toHaveLength(1);
    expect(url(1).searchParams.get("is_archived")).toBe("true");
  });
  it("returns useful API problem details", async () => {
    fetchMock.mockResolvedValue(json({ detail: "unused" }));
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          title: "Forbidden",
          detail: "Missing token permission",
        }),
        { status: 403 },
      ),
    );
    await expect(getLabels()).rejects.toThrow(
      "Vikunja API error (403): Missing token permission",
    );
  });
});

describe("legacy API v1", () => {
  beforeEach(() => {
    preferences.apiVersion = "v1";
  });
  it("uses array responses and pagination headers", async () => {
    fetchMock
      .mockResolvedValueOnce(
        json([{ id: 1 }], { "x-pagination-total-pages": "2" }),
      )
      .mockResolvedValueOnce(
        json([{ id: 2 }], { "x-pagination-total-pages": "2" }),
      );
    expect(await getLabels()).toEqual([{ id: 1 }, { id: 2 }]);
    expect(url().pathname).toBe("/api/v1/labels");
    expect(url().searchParams.has("format")).toBe(false);
  });
  it("does not truncate server-capped pages when headers are unavailable", async () => {
    fetchMock
      .mockResolvedValueOnce(json([{ id: 1 }]))
      .mockResolvedValueOnce(json([{ id: 2 }]))
      .mockResolvedValueOnce(json([]));
    expect(await getAllTasks()).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
  it("keeps legacy write methods and search parameter", async () => {
    fetchMock.mockImplementation(async () => json({ id: 1 }));
    await createTask(42, { title: "New" });
    await updateTask(1, { done: true });
    await addLabelToTask(1, 7);
    expect(fetchMock.mock.calls.map(([, init]) => init?.method)).toEqual([
      "PUT",
      "POST",
      "PUT",
    ]);
    fetchMock.mockResolvedValueOnce(json([]));
    await searchTasks("example");
    expect(url(3).searchParams.get("s")).toBe("example");
  });
});

it("normalizes API URLs while keeping subpath deployments and browser links", async () => {
  preferences.apiUrl = " https://example.com/vikunja/api/v2/ ";
  expect(getBaseUrl()).toBe("https://example.com/vikunja");
  fetchMock.mockResolvedValue(json({ items: [], total_pages: 0 }));
  await getLabels();
  expect(url().pathname).toBe("/vikunja/api/v2/labels");
  expect(fetchMock.mock.calls[0][1]?.headers).toHaveProperty(
    "Authorization",
    "Bearer test-token",
  );
});

it("serializes cleared dates and root projects as Vikunja zero values", async () => {
  fetchMock.mockImplementation(async () => json({ id: 1 }));
  await createTask(1, { title: "No due date", due_date: null });
  await updateTask(1, { due_date: null });
  await createProject({ title: "Root", parent_project_id: null });
  await updateProject(1, { parent_project_id: null });
  for (const call of fetchMock.mock.calls.slice(0, 2)) {
    expect(JSON.parse(String(call[1]?.body)).due_date).toBe(
      "0001-01-01T00:00:00Z",
    );
  }
  for (const call of fetchMock.mock.calls.slice(2)) {
    expect(JSON.parse(String(call[1]?.body)).parent_project_id).toBe(0);
  }
});
