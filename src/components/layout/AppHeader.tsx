import { useEffect, useState } from "react";
import { Copy, Minus, Moon, Square, Sun, X, Zap } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauriRuntime } from "@/services/tauriClient";
import { useAppStore, type ActiveNavTab } from "@/stores/useAppStore";
import { useTaskStore } from "@/stores/useTaskStore";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const TAB_TITLES: Record<ActiveNavTab, string> = {
  runner: "工作台",
  endpoints: "接口库",
  history: "历史记录",
  settings: "设置",
};

export function AppHeader() {
  const { activeTab, setActiveTab, settings, toggleTheme, runtimeInfo } =
    useAppStore();
  const tasks = useTaskStore((s) => s.tasks);
  const [maximized, setMaximized] = useState(false);

  const inTauri = isTauriRuntime();
  const isMac =
    inTauri &&
    (runtimeInfo?.os === "macos" ||
      (typeof navigator !== "undefined" &&
        /Mac/i.test(navigator.platform || navigator.userAgent)));
  const isWindows = inTauri && runtimeInfo?.os === "windows";

  const runningCount = tasks.filter(
    (t) => t.status === "running" || t.status === "paused",
  ).length;

  useEffect(() => {
    if (!isWindows) return;
    const win = getCurrentWindow();
    void win.isMaximized().then(setMaximized).catch(() => {});
  }, [isWindows]);

  const handleToggleMaximize = async () => {
    if (!inTauri) return;
    try {
      const win = getCurrentWindow();
      await win.toggleMaximize();
      setMaximized(await win.isMaximized());
    } catch {
      // ignore outside native window
    }
  };

  const handleMinimize = async () => {
    if (!inTauri) return;
    try {
      await getCurrentWindow().minimize();
    } catch {
      // ignore
    }
  };

  const handleClose = async () => {
    if (!inTauri) return;
    try {
      await getCurrentWindow().close();
    } catch {
      // ignore
    }
  };

  return (
    <header
      data-tauri-drag-region="deep"
      className="flex h-10 w-full shrink-0 select-none items-center border-b border-border/80 bg-card/85 backdrop-blur-md"
    >
      {/* Left Brand Slot (aligned with w-52 Sidebar, leaves native traffic-light inset on macOS) */}
      <div
        className={cn(
          "flex h-full w-52 shrink-0 items-center gap-2 border-r border-border/80 pr-3",
          isMac ? "pl-[78px]" : "pl-3.5",
        )}
      >
        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-sky-500 via-indigo-500 to-cyan-400 text-white shadow-sm">
          <Zap className="h-3 w-3 fill-current" />
        </div>
        <span className="truncate text-xs font-bold tracking-tight">Pulse</span>
      </div>

      {/* Main Header Area */}
      <div className="flex h-full min-w-0 flex-1 items-center justify-between pl-4 pr-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            {TAB_TITLES[activeTab]}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {runningCount > 0 && (
            <button
              type="button"
              onClick={() => setActiveTab("runner")}
              className="mr-1 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/12 px-2.5 py-0.5 text-[11px] font-medium text-emerald-400 transition hover:bg-emerald-500/20"
            >
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              {runningCount} 运行中
            </button>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={() => void toggleTheme()}
            title="切换主题"
          >
            {settings.theme === "dark" ? (
              <Sun className="h-3.5 w-3.5" />
            ) : (
              <Moon className="h-3.5 w-3.5" />
            )}
          </Button>

          {/* Custom Window Controls on Windows */}
          {isWindows && (
            <div className="ml-1 flex items-center">
              <button
                type="button"
                onClick={() => void handleMinimize()}
                className="flex h-7 w-8 items-center justify-center rounded text-muted-foreground transition hover:bg-accent hover:text-foreground"
                title="最小化"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => void handleToggleMaximize()}
                className="flex h-7 w-8 items-center justify-center rounded text-muted-foreground transition hover:bg-accent hover:text-foreground"
                title={maximized ? "还原" : "最大化"}
              >
                {maximized ? (
                  <Copy className="h-3 w-3" />
                ) : (
                  <Square className="h-3 w-3" />
                )}
              </button>
              <button
                type="button"
                onClick={() => void handleClose()}
                className="flex h-7 w-8 items-center justify-center rounded text-muted-foreground transition hover:bg-rose-500 hover:text-white"
                title="关闭"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
