import { useMemo, useState } from "react";
import {
  BarChart3,
  CheckCircle2,
  Download,
  ExternalLink,
  RotateCcw,
  Search,
  Trash2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import type { TaskStatus } from "@/types/task";
import { useTaskStore } from "@/stores/useTaskStore";
import { useAppStore } from "@/stores/useAppStore";
import { formatDurationMs, formatNumber } from "@/lib/utils";
import { exportTaskReportAsJson } from "@/lib/exportReport";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

const STATUS_LABELS: Record<TaskStatus, string> = {
  running: "运行中",
  paused: "已暂停",
  completed: "已完成",
  cancelled: "已终止",
  failed: "失败",
};

export function HistoryAnalyticsView() {
  const { tasks, selectTask, openComposer, deleteTask, clearHistory } =
    useTaskStore();
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const [query, setQuery] = useState("");

  const summary = useMemo(() => {
    let totalReqs = 0;
    let totalOk = 0;
    let totalFail = 0;
    let maxPeakRps = 0;

    for (const t of tasks) {
      totalReqs += t.metrics.completed;
      totalOk += t.metrics.succeeded;
      totalFail += t.metrics.failed;
      maxPeakRps = Math.max(maxPeakRps, t.metrics.peakRps);
    }

    const overallRate =
      totalReqs > 0 ? ((totalOk / totalReqs) * 100).toFixed(1) : "0.0";

    return { totalReqs, totalOk, totalFail, overallRate, maxPeakRps };
  }, [tasks]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tasks;
    return tasks.filter((t) => t.config.name.toLowerCase().includes(q));
  }, [tasks, query]);

  const handleInspect = (taskId: string) => {
    selectTask(taskId);
    setActiveTab("runner");
  };

  return (
    <ScrollArea className="h-full w-full">
      <div className="space-y-5 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-base font-bold">
            <BarChart3 className="h-4 w-4 text-primary" />
            历史记录
          </h2>

          {tasks.some(
            (t) => t.status !== "running" && t.status !== "paused",
          ) && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs text-destructive hover:text-destructive"
              onClick={() => {
                void clearHistory();
                toast.success("已清空历史记录");
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              清空已完成
            </Button>
          )}
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <span className="text-xs text-muted-foreground">累计请求</span>
            <div className="mt-1.5 font-mono text-2xl font-bold">
              {formatNumber(summary.totalReqs)}
            </div>
            <span className="text-[11px] text-muted-foreground">
              共 {tasks.length} 个任务
            </span>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>累计成功</span>
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            </div>
            <div className="mt-1.5 font-mono text-2xl font-bold text-emerald-500">
              {formatNumber(summary.totalOk)}
            </div>
            <span className="font-mono text-[11px] text-muted-foreground">
              成功率 {summary.overallRate}%
            </span>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>累计失败</span>
              <XCircle className="h-4 w-4 text-rose-500" />
            </div>
            <div className="mt-1.5 font-mono text-2xl font-bold text-rose-500">
              {formatNumber(summary.totalFail)}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <span className="text-xs text-muted-foreground">峰值吞吐</span>
            <div className="mt-1.5 font-mono text-2xl font-bold text-sky-400">
              {formatNumber(summary.maxPeakRps)}{" "}
              <span className="text-xs font-normal">req/s</span>
            </div>
          </div>
        </div>

        {/* Search & Table */}
        <div className="space-y-3">
          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索任务名称..."
              className="h-8 pl-8 text-xs"
            />
          </div>

          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="grid grid-cols-[1.5fr_90px_90px_1.2fr_100px_90px_140px] items-center gap-2 border-b border-border bg-muted/40 px-4 py-2.5 text-[11px] font-medium text-muted-foreground">
              <span>任务名称</span>
              <span>状态</span>
              <span>并发 × 轮次</span>
              <span>成功 / 失败</span>
              <span>均速 / 均耗时</span>
              <span>耗时</span>
              <span className="text-right">操作</span>
            </div>

            {filtered.length === 0 ? (
              <div className="py-12 text-center text-xs text-muted-foreground">
                暂无历史记录
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {filtered.map((t) => {
                  const rate =
                    t.metrics.completed > 0
                      ? ((t.metrics.succeeded / t.metrics.completed) * 100).toFixed(
                          1,
                        )
                      : "0.0";
                  return (
                    <div
                      key={t.id}
                      className="grid grid-cols-[1.5fr_90px_90px_1.2fr_100px_90px_140px] items-center gap-2 px-4 py-3 text-xs hover:bg-accent/30"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-semibold">
                          {t.config.name}
                        </div>
                        <div className="truncate text-[11px] text-muted-foreground">
                          {t.config.endpointIds.length} 个接口
                          {t.config.paramMode === "dataset" &&
                            ` · ${t.config.datasetRows.length} 组参数`}
                        </div>
                      </div>

                      <div>
                        <Badge variant="outline" className="text-[10px]">
                          {STATUS_LABELS[t.status] ?? t.status}
                        </Badge>
                      </div>

                      <span className="font-mono text-[11px]">
                        {t.config.concurrency} × {t.config.iterations}
                      </span>

                      <div className="font-mono text-[11px]">
                        <span className="text-emerald-500">
                          {formatNumber(t.metrics.succeeded)}
                        </span>
                        {" / "}
                        <span className="text-rose-400">
                          {formatNumber(t.metrics.failed)}
                        </span>
                        <span className="ml-1 text-muted-foreground">
                          ({rate}%)
                        </span>
                      </div>

                      <div className="font-mono text-[11px]">
                        <div>{t.metrics.avgRps}/s</div>
                        <div className="text-muted-foreground">
                          {t.metrics.avgLatencyMs}ms
                        </div>
                      </div>

                      <span className="font-mono text-[11px] text-muted-foreground">
                        {formatDurationMs(t.metrics.activeElapsedMs)}
                      </span>

                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="查看详情"
                          onClick={() => handleInspect(t.id)}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="重跑"
                          onClick={() => {
                            setActiveTab("runner");
                            openComposer(t.config.endpointIds, t.config);
                          }}
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="导出 JSON"
                          onClick={() => exportTaskReportAsJson(t)}
                        >
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                        {t.status !== "running" && t.status !== "paused" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            title="删除"
                            onClick={() => void deleteTask(t.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}
