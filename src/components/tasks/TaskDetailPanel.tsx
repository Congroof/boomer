import { useMemo, useState } from "react";
import {
  Activity,
  CheckCircle2,
  Clock,
  Download,
  FileSpreadsheet,
  Gauge,
  Pause,
  Play,
  RotateCcw,
  Search,
  Square,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import type { RequestLogEntry, TaskSnapshot } from "@/types/task";
import { useTaskStore } from "@/stores/useTaskStore";
import {
  cn,
  formatBytes,
  formatDurationMs,
  formatNumber,
  getMethodColorClass,
} from "@/lib/utils";
import {
  exportTaskLogsAsCsv,
  exportTaskReportAsJson,
} from "@/lib/exportReport";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TaskCharts } from "./TaskCharts";

interface TaskDetailPanelProps {
  task: TaskSnapshot;
}

export function TaskDetailPanel({ task }: TaskDetailPanelProps) {
  const { pauseTask, resumeTask, cancelTask, openComposer } = useTaskStore();
  const [logFilter, setLogFilter] = useState<"all" | "failed" | "succeeded">(
    "all",
  );
  const [logQuery, setLogQuery] = useState("");
  const [inspectedLog, setInspectedLog] = useState<RequestLogEntry | null>(
    null,
  );

  const { metrics } = task;
  const progressPct =
    metrics.totalPlanned > 0
      ? Math.min(100, (metrics.completed / metrics.totalPlanned) * 100)
      : 0;
  const successRate =
    metrics.completed > 0
      ? ((metrics.succeeded / metrics.completed) * 100).toFixed(1)
      : "0.0";

  const statusMeta = {
    running: {
      label: "运行中",
      cls: "border-emerald-500/40 bg-emerald-500/15 text-emerald-400",
      dot: "bg-emerald-400 animate-pulse",
    },
    paused: {
      label: "已暂停",
      cls: "border-amber-500/40 bg-amber-500/15 text-amber-400",
      dot: "bg-amber-400",
    },
    completed: {
      label: "已完成",
      cls: "border-sky-500/40 bg-sky-500/15 text-sky-400",
      dot: "bg-sky-400",
    },
    cancelled: {
      label: "已终止",
      cls: "border-zinc-500/40 bg-zinc-500/15 text-zinc-400",
      dot: "bg-zinc-400",
    },
    failed: {
      label: "异常熔断",
      cls: "border-rose-500/40 bg-rose-500/15 text-rose-400",
      dot: "bg-rose-400",
    },
  }[task.status];

  const displayedLogs = useMemo(() => {
    const source =
      logFilter === "failed"
        ? task.recentFailures
        : logFilter === "succeeded"
          ? task.recentLogs.filter((l) => l.success)
          : task.recentLogs;

    const q = logQuery.trim().toLowerCase();
    if (!q) return source;
    return source.filter(
      (item) =>
        item.endpointName.toLowerCase().includes(q) ||
        item.resolvedUrl.toLowerCase().includes(q) ||
        JSON.stringify(item.injectedParams).toLowerCase().includes(q) ||
        (item.failureReason ?? "").toLowerCase().includes(q),
    );
  }, [task.recentLogs, task.recentFailures, logFilter, logQuery]);

  const handlePause = async () => {
    try {
      await pauseTask(task.id);
      toast.info("任务已暂停，所有待发协程已挂起");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const handleResume = async () => {
    try {
      await resumeTask(task.id);
      toast.success("任务已恢复并发执行");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const handleCancel = async () => {
    try {
      await cancelTask(task.id);
      toast.warning("任务已手动终止");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="space-y-4">
      {/* Control & Progress Header Card */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <h3 className="text-base font-bold tracking-tight">
                {task.config.name}
              </h3>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
                  statusMeta.cls,
                )}
              >
                <span className={cn("h-1.5 w-1.5 rounded-full", statusMeta.dot)} />
                {statusMeta.label}
              </span>
              <Badge variant="outline" className="font-mono text-[11px]">
                并发 {task.config.concurrency}
              </Badge>
              <Badge variant="outline" className="font-mono text-[11px]">
                轮次 {task.config.iterations}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              注入参数摘要：
              <code className="ml-1 rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">
                {Object.keys(task.config.singleParams).length > 0
                  ? JSON.stringify(task.config.singleParams)
                  : "(无全局固定参数)"}
              </code>
              {task.config.paramMode === "dataset" && (
                <span className="ml-2 text-indigo-400">
                  · 批量数据集 {task.config.datasetRows.length} 行
                </span>
              )}
            </p>
          </div>

          {/* Action Buttons: Pause / Resume / Stop / Re-run / Export */}
          <div className="flex flex-wrap items-center gap-2">
            {task.status === "running" && (
              <Button
                variant="secondary"
                size="sm"
                className="h-8 gap-1.5 border border-amber-500/30 bg-amber-500/15 text-amber-400 hover:bg-amber-500/25"
                onClick={() => void handlePause()}
              >
                <Pause className="h-3.5 w-3.5 fill-current" />
                暂停任务
              </Button>
            )}

            {task.status === "paused" && (
              <Button
                size="sm"
                className="h-8 gap-1.5 bg-emerald-600 text-white hover:bg-emerald-500"
                onClick={() => void handleResume()}
              >
                <Play className="h-3.5 w-3.5 fill-current" />
                恢复执行
              </Button>
            )}

            {(task.status === "running" || task.status === "paused") && (
              <Button
                variant="destructive"
                size="sm"
                className="h-8 gap-1.5"
                onClick={() => void handleCancel()}
              >
                <Square className="h-3.5 w-3.5 fill-current" />
                终止
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() =>
                openComposer(task.config.endpointIds, task.config)
              }
            >
              <RotateCcw className="h-3.5 w-3.5" />
              以此配置重跑
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1 text-xs"
              onClick={() => {
                exportTaskLogsAsCsv(task);
                toast.success("已导出请求明细 CSV");
              }}
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              CSV
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1 text-xs"
              onClick={() => {
                exportTaskReportAsJson(task);
                toast.success("已导出完整统计报告 JSON");
              }}
            >
              <Download className="h-3.5 w-3.5" />
              JSON
            </Button>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-mono text-muted-foreground">
              执行进度：{formatNumber(metrics.completed)} /{" "}
              {formatNumber(metrics.totalPlanned)} ({progressPct.toFixed(1)}%)
              {metrics.inFlight > 0 && (
                <span className="ml-2 text-primary">
                  · 在途并发 {metrics.inFlight}
                </span>
              )}
            </span>
            <span className="font-mono text-muted-foreground">
              活跃耗时 {formatDurationMs(metrics.activeElapsedMs)} · 累计接收{" "}
              {formatBytes(metrics.bytesReceived)}
            </span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full transition-all duration-150",
                task.status === "paused"
                  ? "bg-amber-500"
                  : metrics.failed > 0 && metrics.succeeded === 0
                    ? "bg-rose-500"
                    : "bg-gradient-to-r from-sky-500 via-indigo-500 to-emerald-500",
              )}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* 4 Core KPI Metric Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-3.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>成功请求数 / 成功率</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold text-emerald-500">
              {formatNumber(metrics.succeeded)}
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              ({successRate}%)
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-3.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>失败请求数 / 重试</span>
            <XCircle className="h-4 w-4 text-rose-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold text-rose-500">
              {formatNumber(metrics.failed)}
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              重试 {formatNumber(metrics.retried)} 次
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-3.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>吞吐速率 (RPS)</span>
            <Gauge className="h-4 w-4 text-sky-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold">
              {task.status === "running"
                ? metrics.currentRps
                : metrics.avgRps}
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              均值 {metrics.avgRps} /s
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-3.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>平均响应耗时</span>
            <Clock className="h-4 w-4 text-indigo-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold">
              {metrics.avgLatencyMs}
              <span className="ml-0.5 text-sm font-normal">ms</span>
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              [{metrics.minLatencyMs}~{metrics.maxLatencyMs}ms]
            </span>
          </div>
        </div>
      </div>

      {/* Real-time Charts & Percentile Breakdown */}
      <TaskCharts metrics={metrics} />

      {/* Bottom Tabs: Per-Endpoint Breakdown vs Request Logs */}
      <Tabs defaultValue="endpoints" className="w-full">
        <TabsList>
          <TabsTrigger value="endpoints" className="text-xs">
            分接口统计明细 ({metrics.endpointMetrics.length})
          </TabsTrigger>
          <TabsTrigger value="logs" className="text-xs">
            实时请求与异常检视 ({task.recentLogs.length} / 失败{" "}
            {task.recentFailures.length})
          </TabsTrigger>
        </TabsList>

        {/* Per-Endpoint Breakdown Table */}
        <TabsContent value="endpoints" className="mt-3">
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="grid grid-cols-[80px_1.6fr_1fr_1fr_1fr_1.3fr_1fr_1fr] items-center gap-2 border-b border-border bg-muted/40 px-4 py-2 text-[11px] font-medium text-muted-foreground">
              <span>方法</span>
              <span>接口名称</span>
              <span>已执行</span>
              <span>成功</span>
              <span>失败</span>
              <span>成功率</span>
              <span>平均耗时</span>
              <span>P95 耗时</span>
            </div>
            <div className="divide-y divide-border/60">
              {metrics.endpointMetrics.map((ep) => {
                const rate =
                  ep.total > 0 ? (ep.succeeded / ep.total) * 100 : 0;
                return (
                  <div
                    key={ep.endpointId}
                    className="grid grid-cols-[80px_1.6fr_1fr_1fr_1fr_1.3fr_1fr_1fr] items-center gap-2 px-4 py-2.5 text-xs"
                  >
                    <div>
                      <span
                        className={cn(
                          "rounded border px-1.5 py-0.5 font-mono text-[10px] font-bold",
                          getMethodColorClass(ep.method),
                        )}
                      >
                        {ep.method}
                      </span>
                    </div>
                    <span className="truncate font-medium">
                      {ep.endpointName}
                    </span>
                    <span className="font-mono">{formatNumber(ep.total)}</span>
                    <span className="font-mono text-emerald-500">
                      {formatNumber(ep.succeeded)}
                    </span>
                    <span className="font-mono text-rose-400">
                      {formatNumber(ep.failed)}
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full bg-emerald-500"
                          style={{ width: `${rate}%` }}
                        />
                      </div>
                      <span className="w-11 text-right font-mono text-[11px]">
                        {rate.toFixed(0)}%
                      </span>
                    </div>
                    <span className="font-mono">{ep.avgLatencyMs}ms</span>
                    <span className="font-mono text-muted-foreground">
                      {ep.p95LatencyMs}ms
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </TabsContent>

        {/* Sampled Request Logs & Failure Inspector */}
        <TabsContent value="logs" className="mt-3 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              {(
                [
                  ["all", `最近采样 (${task.recentLogs.length})`],
                  ["failed", `失败记录 (${task.recentFailures.length})`],
                  [
                    "succeeded",
                    `成功记录 (${task.recentLogs.filter((l) => l.success).length})`,
                  ],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setLogFilter(key)}
                  className={cn(
                    "rounded-md border px-2.5 py-1 text-xs font-medium transition",
                    logFilter === key
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border bg-card text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="relative w-64">
              <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={logQuery}
                onChange={(e) => setLogQuery(e.target.value)}
                placeholder="过滤 URL、手机号参数、失败原因..."
                className="h-7 pl-8 text-xs"
              />
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="grid grid-cols-[64px_92px_1.2fr_1.6fr_84px_76px_1.2fr] items-center gap-2 border-b border-border bg-muted/40 px-3.5 py-2 text-[11px] font-medium text-muted-foreground">
              <span>#序号</span>
              <span>时间</span>
              <span>接口</span>
              <span>请求 URL / 注入参数</span>
              <span>状态</span>
              <span>耗时</span>
              <span>结果或失败原因</span>
            </div>

            {displayedLogs.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                暂无符合筛选条件的请求记录
              </div>
            ) : (
              <div className="max-h-80 divide-y divide-border/60 overflow-y-auto">
                {displayedLogs.map((log) => (
                  <div
                    key={`${log.seq}-${log.timestamp}`}
                    onClick={() => setInspectedLog(log)}
                    className="grid cursor-pointer grid-cols-[64px_92px_1.2fr_1.6fr_84px_76px_1.2fr] items-center gap-2 px-3.5 py-2 text-xs transition hover:bg-accent/50"
                  >
                    <span className="font-mono text-[11px] text-muted-foreground">
                      #{log.seq}
                    </span>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {log.timestamp}
                    </span>
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span
                        className={cn(
                          "shrink-0 rounded border px-1 py-0.2 font-mono text-[9px] font-bold",
                          getMethodColorClass(log.method),
                        )}
                      >
                        {log.method}
                      </span>
                      <span className="truncate">{log.endpointName}</span>
                    </div>
                    <span className="truncate font-mono text-[11px] text-muted-foreground">
                      {log.resolvedUrl}
                    </span>
                    <div>
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold",
                          log.success
                            ? "bg-emerald-500/15 text-emerald-400"
                            : "bg-rose-500/15 text-rose-400",
                        )}
                      >
                        {log.statusCode ?? "ERR"}
                      </span>
                    </div>
                    <span className="font-mono text-[11px]">
                      {log.latencyMs}ms
                    </span>
                    <span
                      className={cn(
                        "truncate text-[11px]",
                        log.success ? "text-emerald-400" : "text-rose-400",
                      )}
                    >
                      {log.success
                        ? "通过断言 (点击查看响应)"
                        : (log.failureReason ?? "请求失败")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Log Entry Detail Inspector Modal */}
      <Dialog
        open={Boolean(inspectedLog)}
        onOpenChange={(o) => !o && setInspectedLog(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <Activity className="h-4 w-4 text-primary" />
              请求详情检视 #{inspectedLog?.seq} — {inspectedLog?.endpointName}
            </DialogTitle>
          </DialogHeader>
          {inspectedLog && (
            <div className="space-y-3 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant={inspectedLog.success ? "default" : "destructive"}
                >
                  {inspectedLog.success ? "成功" : "失败"} · HTTP{" "}
                  {inspectedLog.statusCode ?? "ERR"}
                </Badge>
                <Badge variant="outline" className="font-mono">
                  耗时 {inspectedLog.latencyMs} ms
                </Badge>
                <Badge variant="outline" className="font-mono">
                  时间 {inspectedLog.timestamp}
                </Badge>
              </div>

              <div className="space-y-1">
                <span className="text-[11px] font-medium text-muted-foreground">
                  解析后完整 URL
                </span>
                <div className="rounded-md border border-border bg-muted/40 p-2 font-mono text-[11px] break-all selectable">
                  {inspectedLog.method} {inspectedLog.resolvedUrl}
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-[11px] font-medium text-muted-foreground">
                  本次注入参数快照
                </span>
                <pre className="rounded-md border border-border bg-muted/40 p-2 font-mono text-[11px] selectable">
                  {JSON.stringify(inspectedLog.injectedParams, null, 2)}
                </pre>
              </div>

              {inspectedLog.failureReason && (
                <div className="rounded-md border border-rose-500/30 bg-rose-500/10 p-2 text-rose-300">
                  失败原因：{inspectedLog.failureReason}
                </div>
              )}

              <div className="space-y-1">
                <span className="text-[11px] font-medium text-muted-foreground">
                  响应体预览
                </span>
                <pre className="max-h-56 overflow-auto rounded-md border border-border bg-background p-3 font-mono text-[11px] leading-relaxed selectable">
                  {inspectedLog.responsePreview || "(无响应内容)"}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
