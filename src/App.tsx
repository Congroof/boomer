import { useEffect } from "react";
import { Toaster, toast } from "sonner";
import { useAppStore } from "@/stores/useAppStore";
import { useEndpointStore } from "@/stores/useEndpointStore";
import { useTaskStore } from "@/stores/useTaskStore";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { TaskRunnerView } from "@/components/tasks/TaskRunnerView";
import { EndpointsStudioView } from "@/components/endpoints/EndpointsStudioView";
import { HistoryAnalyticsView } from "@/components/tasks/HistoryAnalyticsView";
import { SettingsView } from "@/components/settings/SettingsView";
import { TaskComposerDialog } from "@/components/tasks/TaskComposerDialog";

export function App() {
  const { activeTab, initApp, settings } = useAppStore();
  const loadEndpoints = useEndpointStore((s) => s.loadEndpoints);
  const { loadTasks, subscribeTelemetry } = useTaskStore();

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    void (async () => {
      try {
        await Promise.all([initApp(), loadEndpoints(), loadTasks()]);
        unlisten = await subscribeTelemetry();
      } catch (err) {
        toast.error(
          `初始化客户端状态失败: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    })();

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <AppSidebar />

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {activeTab === "runner" && <TaskRunnerView />}
        {activeTab === "endpoints" && <EndpointsStudioView />}
        {activeTab === "history" && <HistoryAnalyticsView />}
        {activeTab === "settings" && <SettingsView />}
      </main>

      <TaskComposerDialog />
      <Toaster
        position="bottom-right"
        theme={settings.theme === "light" ? "light" : "dark"}
        richColors
      />
    </div>
  );
}

export default App;
