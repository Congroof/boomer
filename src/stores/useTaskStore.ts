import { create } from "zustand";
import type { TaskConfig, TaskSnapshot } from "@/types/task";
import { tauriApi } from "@/services/tauriClient";

interface TaskState {
  tasks: TaskSnapshot[];
  selectedTaskId: string | null;
  composerOpen: boolean;
  preselectedEndpointIds: string[];
  presetConfig: TaskConfig | null;

  loadTasks: () => Promise<void>;
  subscribeTelemetry: () => Promise<() => void>;
  selectTask: (id: string | null) => void;
  openComposer: (endpointIds?: string[], preset?: TaskConfig) => void;
  closeComposer: () => void;

  startTask: (config: TaskConfig) => Promise<TaskSnapshot>;
  pauseTask: (id: string) => Promise<void>;
  resumeTask: (id: string) => Promise<void>;
  cancelTask: (id: string) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  clearHistory: () => Promise<void>;
}

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  selectedTaskId: null,
  composerOpen: false,
  preselectedEndpointIds: [],
  presetConfig: null,

  loadTasks: async () => {
    const list = await tauriApi.listTasks();
    const current = get().selectedTaskId;
    const validCurrent = current && list.some((t) => t.id === current);
    set({
      tasks: list,
      selectedTaskId: validCurrent ? current : (list[0]?.id ?? null),
    });
  },

  subscribeTelemetry: async () => {
    return tauriApi.onTaskUpdated((incoming) => {
      set((state) => {
        const idx = state.tasks.findIndex((t) => t.id === incoming.id);
        let nextTasks: TaskSnapshot[];
        if (idx >= 0) {
          nextTasks = [...state.tasks];
          nextTasks[idx] = incoming;
        } else {
          nextTasks = [incoming, ...state.tasks];
        }
        return {
          tasks: nextTasks,
          selectedTaskId: state.selectedTaskId ?? incoming.id,
        };
      });
    });
  },

  selectTask: (id) => set({ selectedTaskId: id }),

  openComposer: (endpointIds = [], preset) =>
    set({
      composerOpen: true,
      preselectedEndpointIds: endpointIds,
      presetConfig: preset ? structuredClone(preset) : null,
    }),

  closeComposer: () =>
    set({
      composerOpen: false,
      presetConfig: null,
    }),

  startTask: async (config) => {
    const snap = await tauriApi.startTask(config);
    set((state) => ({
      tasks: [snap, ...state.tasks.filter((t) => t.id !== snap.id)],
      selectedTaskId: snap.id,
      composerOpen: false,
      presetConfig: null,
    }));
    return snap;
  },

  pauseTask: async (id) => {
    const snap = await tauriApi.pauseTask(id);
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? snap : t)),
    }));
  },

  resumeTask: async (id) => {
    const snap = await tauriApi.resumeTask(id);
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? snap : t)),
    }));
  },

  cancelTask: async (id) => {
    const snap = await tauriApi.cancelTask(id);
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? snap : t)),
    }));
  },

  deleteTask: async (id) => {
    const updated = await tauriApi.deleteTaskHistory(id);
    set((state) => ({
      tasks: updated,
      selectedTaskId:
        state.selectedTaskId === id
          ? (updated[0]?.id ?? null)
          : state.selectedTaskId,
    }));
  },

  clearHistory: async () => {
    const updated = await tauriApi.clearTaskHistory();
    set({
      tasks: updated,
      selectedTaskId: updated[0]?.id ?? null,
    });
  },
}));
