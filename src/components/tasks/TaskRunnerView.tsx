import {
  Activity,
  Database,
  Pause,
  Play,
  PlusCircle,
  Rocket,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useTaskStore } from "@/stores/useTaskStore";
import { useEndpointStore } from "@/stores/useEndpointStore";
import { useAppStore } from "@/stores/useAppStore";
import { cn, formatNumber } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TaskDetailPanel } from "./TaskDetailPanel";

export function TaskRunnerView() {
  const {
    tasks,
    selectedTaskId,
    selectTask,
    openComposer,
    pauseTask,
    resumeTask,
    deleteTask,
  } = useTaskStore();
  const endpoints = useEndpointStore((s) => s.endpoints);
  const setActiveTab = useAppStore((s) => s.setActiveTab);

  const selectedTask =
    tasks.find((t) => t.id === selectedTaskId) ?? tasks[0] ?? null;

  const handleQuickDemoRun = async () => {
    const enabled = endpoints.filter((e) => e.enabled);
    if (enabled.length === 0) {
      toast.error("当前没有已启用接口，请先前往接口管理库启用或新建接口");
      return;
    }
    openComposer(enabled.map((e) => e.id));
  };

  if (tasks.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8">
        <div className="max-w-lg space-y-5 rounded-2xl border border-border bg-card/70 p-8 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500/20 via-indigo-500/20 to-emerald-500/20 text-primary ring-1 ring-primary/25">
            <Rocket className="h-7 w-7" />
          </div>

          <div className="space-y-2">
            <h2 className="text-lg font-bold tracking-tight">
              准备就绪 · 启动你的第一个高并发任务
            </h2>
            <p className="text-xs leading-relaxed text-muted-foreground">
              当前接口库已配置{" "}
              <strong className="text-foreground">{endpoints.length}</strong>{" "}
              个接口（其中{" "}
              <strong className="text-emerald-500">
                {endpoints.filter((e) => e.enabled).length}
              </strong>{" "}
              个已启用）。你可以直接注入手机号等自定义参数并发执行，并在运行过程中随时暂停、恢复及查看实时成功/失败分布。
            </p>
          </div>

          <div className="flex items-center justify-center gap-3 pt-1">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setActiveTab("endpoints")}
            >
              <Database className="h-4 w-4" />
              管理 / 录入接口
            </Button>
            <Button
              size="sm"
              className="gap-1.5 px-5"
              onClick={() => void handleQuickDemoRun()}
            >
              <PlusCircle className="h-4 w-4" />
              配置并启动并发任务
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* Left Task Queue & Session Rail */}
      <div className="flex h-full w-72 shrink-0 flex-col border-r border-border bg-card/40">
        <div className="flex items-center justify-between border-b border-border px-3.5 py-3">
          <div className="flex items-center gap-1.5">
            <Activity className="h-4 w-4 text-primary" />
            <span className="text-xs font-semibold">
              任务队列 ({tasks.length})
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 px-2 text-xs"
            onClick={() =>
              openComposer(endpoints.filter((e) => e.enabled).map((e) => e.id))
            }
          >
            <PlusCircle className="h-3.5 w-3.5" />
            新建
          </Button>
        </div>

        <ScrollArea className="flex-1">
          <div className="space-y-1.5 p-2">
            {tasks.map((t) => {
              const active = selectedTask?.id === t.id;
              const pct =
                t.metrics.totalPlanned > 0
                  ? Math.min(
                      100,
                      (t.metrics.completed / t.metrics.totalPlanned) * 100,
                    )
                  : 0;

              return (
                <div
                  key={t.id}
                  onClick={() => selectTask(t.id)}
                  className={cn(
                    "group cursor-pointer rounded-lg border p-2.5 transition",
                    active
                      ? "border-primary/40 bg-primary/10 shadow-sm"
                      : "border-transparent hover:border-border hover:bg-accent/50",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className={cn(
                          "h-2 w-2 shrink-0 rounded-full",
                          t.status === "running" &&
                            "animate-pulse bg-emerald-400",
                          t.status === "paused" && "bg-amber-400",
                          t.status === "completed" && "bg-sky-400",
                          t.status === "cancelled" && "bg-zinc-400",
                          t.status === "failed" && "bg-rose-400",
                        )}
                      />
                      <span className="truncate text-xs font-semibold">
                        {t.config.name}
                      </span>
                    </div>

                    {/* Quick inline Pause / Resume / Delete */}
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="flex shrink-0 items-center gap-0.5"
                    >
                      {t.status === "running" && (
                        <button
                          type="button"
                          onClick={() => void pauseTask(t.id)}
                          className="rounded p-1 text-amber-400 hover:bg-amber-500/15"
                          title="暂停任务"
                        >
                          <Pause className="h-3 w-3 fill-current" />
                        </button>
                      )}
                      {t.status === "paused" && (
                        <button
                          type="button"
                          onClick={() => void resumeTask(t.id)}
                          className="rounded p-1 text-emerald-400 hover:bg-emerald-500/15"
                          title="恢复任务"
                        >
                          <Play className="h-3 w-3 fill-current" />
                        </button>
                      )}
                      {t.status !== "running" && t.status !== "paused" && (
                        <button
                          type="button"
                          onClick={() => void deleteTask(t.id)}
                          className="rounded p-1 text-muted-foreground opacity-0 transition hover:bg-destructive/15 hover:text-destructive group-hover:opacity-100"
                          title="删除记录"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Mini Progress Bar */}
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        "h-full transition-all",
                        t.status === "paused"
                          ? "bg-amber-400"
                          : "bg-primary",
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>

                  <div className="mt-1.5 flex items-center justify-between font-mono text-[10px] text-muted-foreground">
                    <span>
                      {formatNumber(t.metrics.completed)}/
                      {formatNumber(t.metrics.totalPlanned)}
                    </span>
                    <span>
                      <span className="text-emerald-500">
                        ✓{formatNumber(t.metrics.succeeded)}
                      </span>{" "}
                      <span className="text-rose-400">
                        ✗{formatNumber(t.metrics.failed)}
                      </span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </div>

      {/* Right Live Telemetry & Detail Panel */}
      <ScrollArea className="flex-1">
        <div className="p-5">
          {selectedTask && <TaskDetailPanel task={selectedTask} />}
        </div>
      </ScrollArea>
    </div>
  );
}
