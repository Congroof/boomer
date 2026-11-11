import { create } from "zustand";
import type { AppSettings, RuntimeInfo } from "@/types/settings";
import { tauriApi } from "@/services/tauriClient";

export type ActiveNavTab = "runner" | "endpoints" | "history" | "settings";

interface AppStoreState {
  activeTab: ActiveNavTab;
  settings: AppSettings;
  runtimeInfo: RuntimeInfo | null;

  setActiveTab: (tab: ActiveNavTab) => void;
  initApp: () => Promise<void>;
  saveSettings: (next: AppSettings) => Promise<void>;
  toggleTheme: () => Promise<void>;
}

function applyThemeToDocument(theme: AppSettings["theme"]) {
  const root = document.documentElement;
  const prefersDark =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  const isDark = theme === "dark" || (theme === "system" && prefersDark);
  root.classList.toggle("dark", isDark);
}

export const useAppStore = create<AppStoreState>((set, get) => ({
  activeTab: "runner",
  settings: {
    defaultConcurrency: 16,
    defaultTimeoutMs: 10000,
    defaultUserAgent: "Pulse/0.1.0",
    globalProxyUrl: "",
    maxHistoryRecords: 50,
    theme: "dark",
  },
  runtimeInfo: null,

  setActiveTab: (tab) => set({ activeTab: tab }),

  initApp: async () => {
    const [settings, runtimeInfo] = await Promise.all([
      tauriApi.getSettings(),
      tauriApi.getRuntimeInfo(),
    ]);
    applyThemeToDocument(settings.theme);
    set({ settings, runtimeInfo });
  },

  saveSettings: async (next) => {
    const saved = await tauriApi.updateSettings(next);
    applyThemeToDocument(saved.theme);
    set({ settings: saved });
  },

  toggleTheme: async () => {
    const curr = get().settings;
    const nextTheme = curr.theme === "dark" ? "light" : "dark";
    const updated: AppSettings = { ...curr, theme: nextTheme };
    const saved = await tauriApi.updateSettings(updated);
    applyThemeToDocument(saved.theme);
    set({ settings: saved });
  },
}));
