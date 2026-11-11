import { create } from "zustand";
import type {
  EndpointConfig,
  SingleTestResponse,
} from "@/types/endpoint";
import { tauriApi } from "@/services/tauriClient";
import { createEmptyEndpoint } from "@/lib/utils";
import { syncEndpointVariables } from "@/lib/templateVars";

interface EndpointState {
  endpoints: EndpointConfig[];
  selectedId: string | null;
  draft: EndpointConfig | null;
  isDirty: boolean;
  loading: boolean;
  testing: boolean;
  lastTestResult: SingleTestResponse | null;
  searchQuery: string;
  activeGroup: string;

  loadEndpoints: () => Promise<void>;
  selectEndpoint: (id: string) => void;
  startNewEndpoint: (group?: string) => void;
  duplicateEndpoint: (ep: EndpointConfig) => Promise<void>;
  updateDraft: (updater: (prev: EndpointConfig) => EndpointConfig) => void;
  saveDraft: () => Promise<EndpointConfig>;
  deleteEndpoints: (ids: string[]) => Promise<void>;
  toggleEndpoint: (id: string, enabled: boolean) => Promise<void>;
  importEndpoints: (
    list: EndpointConfig[],
    replaceAll?: boolean,
  ) => Promise<void>;
  addDemoEndpoints: () => Promise<void>;
  testCurrentDraft: (
    params: Record<string, string>,
  ) => Promise<SingleTestResponse>;
  clearTestResult: () => void;
  setSearchQuery: (q: string) => void;
  setActiveGroup: (g: string) => void;
}

export const useEndpointStore = create<EndpointState>((set, get) => ({
  endpoints: [],
  selectedId: null,
  draft: null,
  isDirty: false,
  loading: false,
  testing: false,
  lastTestResult: null,
  searchQuery: "",
  activeGroup: "ALL",

  loadEndpoints: async () => {
    set({ loading: true });
    try {
      const list = await tauriApi.listEndpoints();
      const currentSelected = get().selectedId;
      const target =
        list.find((e) => e.id === currentSelected) ?? list[0] ?? null;
      set({
        endpoints: list,
        selectedId: target?.id ?? null,
        draft: target ? structuredClone(target) : null,
        isDirty: false,
        loading: false,
      });
    } catch (err) {
      set({ loading: false });
      throw err;
    }
  },

  selectEndpoint: (id: string) => {
    const found = get().endpoints.find((e) => e.id === id);
    if (!found) return;
    set({
      selectedId: found.id,
      draft: structuredClone(found),
      isDirty: false,
      lastTestResult: null,
    });
  },

  startNewEndpoint: (group?: string) => {
    const currentGroup = get().activeGroup;
    const effectiveGroup =
      group || (currentGroup !== "ALL" ? currentGroup : "默认分组");
    const fresh = createEmptyEndpoint(effectiveGroup);
    set({
      selectedId: null,
      draft: fresh,
      isDirty: true,
      lastTestResult: null,
    });
  },

  duplicateEndpoint: async (ep: EndpointConfig) => {
    const copy: EndpointConfig = {
      ...structuredClone(ep),
      id: "",
      name: `${ep.name} (副本)`,
    };
    const updatedList = await tauriApi.upsertEndpoint(copy);
    const created = updatedList[0];
    set({
      endpoints: updatedList,
      selectedId: created?.id ?? null,
      draft: created ? structuredClone(created) : null,
      isDirty: false,
    });
  },

  updateDraft: (updater) => {
    const prev = get().draft;
    if (!prev) return;
    const next = updater(structuredClone(prev));
    next.variables = syncEndpointVariables(next);
    set({ draft: next, isDirty: true });
  },

  saveDraft: async () => {
    const draft = get().draft;
    if (!draft) throw new Error("当前没有正在编辑的接口");
    const synced: EndpointConfig = {
      ...draft,
      variables: syncEndpointVariables(draft),
    };
    const updatedList = await tauriApi.upsertEndpoint(synced);
    // Find saved endpoint (if newly created, it's inserted at index 0)
    const saved =
      (synced.id
        ? updatedList.find((e) => e.id === synced.id)
        : updatedList[0]) ?? updatedList[0];

    set({
      endpoints: updatedList,
      selectedId: saved?.id ?? null,
      draft: saved ? structuredClone(saved) : null,
      isDirty: false,
    });
    return saved;
  },

  deleteEndpoints: async (ids: string[]) => {
    const updated = await tauriApi.deleteEndpoints(ids);
    const currentId = get().selectedId;
    const stillExists = currentId && updated.some((e) => e.id === currentId);
    const fallback = stillExists
      ? updated.find((e) => e.id === currentId)!
      : updated[0] ?? null;

    set({
      endpoints: updated,
      selectedId: fallback?.id ?? null,
      draft: fallback ? structuredClone(fallback) : null,
      isDirty: false,
    });
  },

  toggleEndpoint: async (id: string, enabled: boolean) => {
    const updated = await tauriApi.toggleEndpoint(id, enabled);
    const draft = get().draft;
    set({
      endpoints: updated,
      draft:
        draft && draft.id === id ? { ...draft, enabled } : draft,
    });
  },

  importEndpoints: async (list: EndpointConfig[], replaceAll = false) => {
    const updated = await tauriApi.importEndpoints(list, replaceAll);
    const first = updated[0] ?? null;
    set({
      endpoints: updated,
      selectedId: first?.id ?? null,
      draft: first ? structuredClone(first) : null,
      isDirty: false,
    });
  },

  addDemoEndpoints: async () => {
    const updated = await tauriApi.addDemoEndpoints();
    const first = updated[0] ?? null;
    set({
      endpoints: updated,
      selectedId: first?.id ?? null,
      draft: first ? structuredClone(first) : null,
      isDirty: false,
    });
  },

  testCurrentDraft: async (params: Record<string, string>) => {
    const draft = get().draft;
    if (!draft) throw new Error("请先选择或创建接口");
    set({ testing: true });
    try {
      const res = await tauriApi.testSingleEndpoint({
        endpoint: draft,
        params,
      });
      set({ lastTestResult: res, testing: false });
      return res;
    } catch (err) {
      set({ testing: false });
      throw err;
    }
  },

  clearTestResult: () => set({ lastTestResult: null }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setActiveGroup: (g) => set({ activeGroup: g }),
}));
