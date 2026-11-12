import { createElement, type ReactNode } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getProjects: vi.fn(),
  createTask: vi.fn(),
  showToast: vi.fn(),
  open: vi.fn(),
  popToRoot: vi.fn(),
  preferences: { defaultProject: "all" },
}));

vi.mock("@raycast/api", () => {
  const component =
    (name: string) => (props: { children?: ReactNode; actions?: ReactNode }) =>
      createElement(name, props, props.children, props.actions);
  return {
    Detail: component("Detail"),
    Form: Object.assign(component("Form"), {
      TextField: component("TextField"),
      TextArea: component("TextArea"),
      Dropdown: Object.assign(component("Dropdown"), {
        Item: component("Item"),
      }),
      DatePicker: Object.assign(component("DatePicker"), {
        Type: { Date: "date" },
      }),
      TagPicker: Object.assign(component("TagPicker"), {
        Item: component("Tag"),
      }),
      Checkbox: component("Checkbox"),
    }),
    Action: Object.assign(component("Action"), {
      SubmitForm: component("SubmitForm"),
      OpenInBrowser: component("OpenInBrowser"),
    }),
    ActionPanel: Object.assign(component("ActionPanel"), {
      Section: component("Section"),
    }),
    Toast: {
      Style: { Failure: "failure", Animated: "animated", Success: "success" },
    },
    Color: {},
    LaunchType: { UserInitiated: "user" },
    getPreferenceValues: () => mocks.preferences,
    showToast: mocks.showToast,
    getSelectedText: vi.fn().mockResolvedValue(""),
    open: mocks.open,
    launchCommand: vi.fn(),
    popToRoot: mocks.popToRoot,
  };
});
vi.mock("../src/api", () => ({
  getBaseUrl: () => "https://example.com",
  getProjects: mocks.getProjects,
  getLabels: vi.fn().mockResolvedValue([]),
  createTask: mocks.createTask,
  addLabelsToTask: vi.fn(),
}));
import CreateTask from "../src/create-task";

let renderer: ReactTestRenderer;
const projects = [
  { id: 11, title: "Inbox" },
  { id: 22, title: "Work" },
];
const formValues = {
  title: "Regression test",
  description: "",
  dueDate: null,
  priority: "0",
  labelIds: [],
  isFavorite: false,
};
const dropdown = () =>
  renderer.root
    .findAllByType("Dropdown")
    .find((node) => node.props.id === "projectId")!;
const submit = async (values: Record<string, unknown> = formValues) => {
  await act(async () => {
    await renderer.root.findByType("SubmitForm").props.onSubmit(values);
  });
};
async function mount(projectId?: string, contextProjectId?: number) {
  await act(async () => {
    renderer = create(
      <CreateTask
        {...({
          arguments: { title: "Regression test", projectId },
          launchContext: { projectId: contextProjectId },
        } as Parameters<typeof CreateTask>[0])}
      />,
    );
  });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.getProjects.mockReset().mockResolvedValue(projects);
  mocks.createTask
    .mockReset()
    .mockResolvedValue({ id: 99, title: "Regression test" });
  mocks.showToast.mockClear();
  mocks.open.mockReset().mockResolvedValue(undefined);
  mocks.popToRoot.mockReset().mockResolvedValue(undefined);
  mocks.preferences.defaultProject = "all";
});
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  vi.unstubAllGlobals();
});

it("waits for projects, then submits the visible Inbox without touching the dropdown", async () => {
  let resolveProjects!: (value: typeof projects) => void;
  mocks.getProjects.mockReturnValue(
    new Promise((resolve) => {
      resolveProjects = resolve;
    }),
  );
  await mount();
  expect(dropdown()).toBeUndefined();
  await act(async () => {
    resolveProjects(projects);
  });
  expect(dropdown().props.value).toBe("11");
  await submit(); // Simulate SuperCmd omitting an untouched field.
  expect(mocks.createTask).toHaveBeenCalledWith(
    11,
    expect.objectContaining({ title: "Regression test" }),
  );
});

it("submits a changed selection even when SuperCmd omits its value", async () => {
  await mount();
  await act(async () => dropdown().props.onChange("22"));
  expect(dropdown().props.value).toBe("22");
  await submit({ ...formValues, projectId: "" });
  expect(mocks.createTask).toHaveBeenCalledWith(22, expect.anything());
});

it("respects an explicitly submitted project", async () => {
  await mount();
  await submit({ ...formValues, projectId: "22" });
  expect(mocks.createTask).toHaveBeenCalledWith(22, expect.anything());
});

it("uses the configured default project", async () => {
  mocks.preferences.defaultProject = "22";
  await mount();
  expect(dropdown().props.value).toBe("22");
  await submit();
  expect(mocks.createTask).toHaveBeenCalledWith(22, expect.anything());
});

it("prioritizes a project argument over launch context and preferences", async () => {
  mocks.preferences.defaultProject = "22";
  await mount("11", 22);
  expect(dropdown().props.value).toBe("11");
});

it("uses the project supplied by launch context", async () => {
  await mount(undefined, 22);
  expect(dropdown().props.value).toBe("22");
});

it("falls back to an available project when the configured project is missing", async () => {
  mocks.preferences.defaultProject = "999";
  await mount("888");
  expect(dropdown().props.value).toBe("11");
});

it("does not create a task if no project is available", async () => {
  mocks.getProjects.mockResolvedValue([]);
  await mount();
  await submit();
  expect(mocks.createTask).not.toHaveBeenCalled();
  expect(mocks.showToast).toHaveBeenCalledWith(
    expect.objectContaining({ title: "Please select a project" }),
  );
});

it("rejects a submitted project that is not in the available projects", async () => {
  await mount();
  await submit({ ...formValues, projectId: "11junk" });
  expect(mocks.createTask).not.toHaveBeenCalled();
});

it("keeps the success action alive and opens the created task before leaving", async () => {
  await mount();
  await submit();
  expect(mocks.popToRoot).not.toHaveBeenCalled();
  expect(renderer.root.findAllByType("SubmitForm")).toHaveLength(0);
  expect(renderer.root.findByType("Detail").props.navigationTitle).toBe(
    "Regression test",
  );
  const toast = mocks.showToast.mock.calls.find(
    ([options]) => options.title === "Task created",
  )![0];
  let finishOpening!: () => void;
  mocks.open.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      finishOpening = resolve;
    }),
  );
  const opening = toast.primaryAction.onAction();
  expect(mocks.open).toHaveBeenCalledWith("https://example.com/tasks/99");
  expect(mocks.popToRoot).not.toHaveBeenCalled();
  finishOpening();
  await opening;
  expect(mocks.popToRoot).toHaveBeenCalledTimes(1);
});

it("reports opening failures without discarding the created task", async () => {
  await mount();
  await submit();
  const toast = mocks.showToast.mock.calls.find(
    ([options]) => options.title === "Task created",
  )![0];
  mocks.open.mockRejectedValueOnce(new Error("Browser unavailable"));
  await toast.primaryAction.onAction();
  expect(mocks.popToRoot).not.toHaveBeenCalled();
  expect(mocks.showToast).toHaveBeenLastCalledWith(
    expect.objectContaining({
      title: "Could not open Vikunja",
      message: "Browser unavailable",
    }),
  );
  expect(renderer.root.findByType("Detail")).toBeDefined();
});

it("also offers opening the task and dismissing from the success screen", async () => {
  await mount();
  await submit();
  const actions = renderer.root.findAllByType("Action");
  await actions
    .find((action) => action.props.title === "Open in Vikunja")!
    .props.onAction();
  expect(mocks.open).toHaveBeenCalledWith("https://example.com/tasks/99");
  mocks.open.mockClear();
  mocks.popToRoot.mockClear();
  await actions
    .find((action) => action.props.title === "Done")!
    .props.onAction();
  expect(mocks.open).not.toHaveBeenCalled();
  expect(mocks.popToRoot).toHaveBeenCalledTimes(1);
});
