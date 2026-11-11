import { useEffect, useMemo, useState } from "react";
import {
  CheckSquare,
  Layers,
  Play,
  Plus,
  SlidersHorizontal,
  Square,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useEndpointStore } from "@/stores/useEndpointStore";
import { useTaskStore } from "@/stores/useTaskStore";
import { useAppStore } from "@/stores/useAppStore";
import { aggregateTaskVariables } from "@/lib/templateVars";
import { cn, formatNumber, getMethodColorClass } from "@/lib/utils";
import type { ParamInjectionMode, TaskConfig } from "@/types/task";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";

export function TaskComposerDialog() {
  const {
    composerOpen,
    preselectedEndpointIds,
    presetConfig,
    closeComposer,
    startTask,
  } = useTaskStore();
  const endpoints = useEndpointStore((s) => s.endpoints);
  const settings = useAppStore((s) => s.settings);

  const [taskName, setTaskName] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [paramMode, setParamMode] = useState<ParamInjectionMode>("single");
  const [singleParams, setSingleParams] = useState<Record<string, string>>({});
  const [extraParams, setExtraParams] = useState<[string, string][]>([]);
  const [batchTargetKey, setBatchTargetKey] = useState("");
  const [batchLinesText, setBatchLinesText] = useState("");

  const [concurrency, setConcurrency] = useState(16);
  const [iterations, setIterations] = useState(20);
  const [intervalMs, setIntervalMs] = useState(0);
  const [maxRpsText, setMaxRpsText] = useState("");
  const [timeoutMs, setTimeoutMs] = useState(10000);
  const [retryCount, setRetryCount] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // Initialize form whenever dialog opens
  useEffect(() => {
    if (!composerOpen) return;

    if (presetConfig) {
      setTaskName(`${presetConfig.name} (重跑)`);
      setSelectedIds(presetConfig.endpointIds);
      setParamMode(presetConfig.paramMode);
      setSingleParams({ ...presetConfig.singleParams });
      if (presetConfig.datasetRows.length > 0) {
        const firstKeys = Object.keys(presetConfig.datasetRows[0]);
        if (
          firstKeys.length === 1 &&
          presetConfig.datasetRows.every((r) => Object.keys(r).length === 1)
        ) {
          const k = firstKeys[0];
          setBatchTargetKey(k);
          setBatchLinesText(
            presetConfig.datasetRows.map((r) => r[k] ?? "").join("\n"),
          );
        } else {
          setBatchLinesText(JSON.stringify(presetConfig.datasetRows, null, 2));
        }
      } else {
        setBatchLinesText("");
      }
      setConcurrency(presetConfig.concurrency);
      setIterations(presetConfig.iterations);
      setIntervalMs(presetConfig.intervalMs);
      setMaxRpsText(presetConfig.maxRps ? String(presetConfig.maxRps) : "");
      setTimeoutMs(presetConfig.timeoutMs);
      setRetryCount(presetConfig.retryCount);
      return;
    }

    const defaultIds =
      preselectedEndpointIds.length > 0
        ? preselectedEndpointIds
        : endpoints.filter((e) => e.enabled).map((e) => e.id);

    setSelectedIds(defaultIds);
    setTaskName(
      `任务 #${new Date().toTimeString().slice(0, 8).replace(/:/g, "")}`,
    );
    setParamMode("single");
    setSingleParams({});
    setBatchTargetKey("");
    setBatchLinesText("");
    setConcurrency(settings.defaultConcurrency || 16);
    setIterations(20);
    setIntervalMs(0);
    setMaxRpsText("");
    setTimeoutMs(settings.defaultTimeoutMs || 10000);
    setRetryCount(0);
    setExtraParams([]);
  }, [composerOpen]);

  const selectedEndpoints = useMemo(
    () => endpoints.filter((e) => selectedIds.includes(e.id)),
    [endpoints, selectedIds],
  );

  const aggregatedVars = useMemo(
    () => aggregateTaskVariables(selectedEndpoints),
    [selectedEndpoints],
  );

  // Pre-populate defaults for detected variables
  useEffect(() => {
    if (!composerOpen) return;
    setSingleParams((prev) => {
      const next = { ...prev };
      for (const v of aggregatedVars) {
        if (next[v.key] === undefined) {
          next[v.key] = v.defaultValue ?? "";
        }
      }
      return next;
    });
    if (
      aggregatedVars.length > 0 &&
      (!batchTargetKey || !aggregatedVars.some((v) => v.key === batchTargetKey))
    ) {
      setBatchTargetKey(aggregatedVars[0].key);
    }
  }, [aggregatedVars, composerOpen]);

  const parsedDatasetRows = useMemo(() => {
    if (paramMode !== "dataset") return [];
    const trimmed = batchLinesText.trim();
    if (!trimmed) return [];

    // Support JSON array of objects OR newline-delimited values
    if (trimmed.startsWith("[")) {
      try {
        const arr = JSON.parse(trimmed);
        if (Array.isArray(arr)) {
          return arr
            .filter((item) => item && typeof item === "object")
            .map((item) => {
              const row: Record<string, string> = {};
              for (const [k, v] of Object.entries(item)) {
                row[k] = String(v ?? "");
              }
              return row;
            });
        }
      } catch {
        // Fallback to line splitting
      }
    }

    const key = batchTargetKey.trim() || aggregatedVars[0]?.key || "id";
    return trimmed
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((val) => ({ [key]: val }));
  }, [paramMode, batchLinesText, batchTargetKey, aggregatedVars]);

  const effectiveRowCount =
    paramMode === "dataset" ? Math.max(1, parsedDatasetRows.length) : 1;
  const totalPlanned =
    selectedEndpoints.length * effectiveRowCount * Math.max(1, iterations);

  const toggleEndpointId = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleLaunch = async () => {
    if (selectedEndpoints.length === 0) {
      toast.error("请至少选择一个接口");
      return;
    }

    const mergedSingle: Record<string, string> = { ...singleParams };
    for (const [k, v] of extraParams) {
      if (k.trim()) mergedSingle[k.trim()] = v;
    }

    if (paramMode === "single") {
      for (const v of aggregatedVars) {
        if (v.required && !(mergedSingle[v.key] ?? "").trim()) {
          toast.error(`请填写必填参数：${v.label || v.key}`);
          return;
        }
      }
    } else if (parsedDatasetRows.length === 0) {
      toast.error("请至少输入一行参数数据");
      return;
    }

    const parsedRps = Number(maxRpsText);
    const config: TaskConfig = {
      name: taskName.trim() || "未命名任务",
      endpointIds: selectedEndpoints.map((e) => e.id),
      paramMode,
      singleParams: mergedSingle,
      datasetRows: paramMode === "dataset" ? parsedDatasetRows : [],
      concurrency: Math.max(1, Math.min(512, Number(concurrency) || 1)),
      iterations: Math.max(1, Number(iterations) || 1),
      intervalMs: Math.max(0, Number(intervalMs) || 0),
      maxRps: maxRpsText.trim() && parsedRps > 0 ? parsedRps : null,
      timeoutMs: Math.max(200, Number(timeoutMs) || 10000),
      retryCount: Math.max(0, Math.min(5, Number(retryCount) || 0)),
      proxyUrl: null,
      stopOnFailCount: null,
    };

    setSubmitting(true);
    try {
      const snap = await startTask(config);
      toast.success(
        `任务「${snap.config.name}」已启动（共 ${formatNumber(snap.metrics.totalPlanned)} 次请求）`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={composerOpen} onOpenChange={(o) => !o && closeComposer()}>
      <DialogContent className="max-w-3xl overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle className="text-base">
            {presetConfig ? "重新运行任务" : "新建任务"}
          </DialogTitle>
          <DialogDescription>配置目标接口、变量与执行参数。</DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh]">
          <div className="space-y-5 px-6 py-4">
            {/* Task Name */}
            <div className="grid grid-cols-[100px_1fr] items-center gap-3">
              <Label className="text-xs font-semibold">任务名称</Label>
              <Input
                value={taskName}
                onChange={(e) => setTaskName(e.target.value)}
                placeholder="输入任务名称"
                className="h-8 text-xs"
              />
            </div>

            {/* Section 1: Endpoint Selection */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5 text-xs font-semibold">
                  <Layers className="h-3.5 w-3.5 text-primary" />
                  目标接口 ({selectedEndpoints.length}/{endpoints.length})
                </Label>
                <div className="flex items-center gap-2 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setSelectedIds(endpoints.map((e) => e.id))}
                    className="text-primary hover:underline"
                  >
                    全选
                  </button>
                  <span className="text-border">|</span>
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedIds(
                        endpoints.filter((e) => e.enabled).map((e) => e.id),
                      )
                    }
                    className="text-primary hover:underline"
                  >
                    已启用
                  </button>
                  <span className="text-border">|</span>
                  <button
                    type="button"
                    onClick={() => setSelectedIds([])}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    清空
                  </button>
                </div>
              </div>

              <div className="grid max-h-40 grid-cols-2 gap-1.5 overflow-y-auto rounded-lg border border-border bg-muted/25 p-2">
                {endpoints.map((ep) => {
                  const checked = selectedIds.includes(ep.id);
                  return (
                    <button
                      key={ep.id}
                      type="button"
                      onClick={() => toggleEndpointId(ep.id)}
                      className={cn(
                        "flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-left transition",
                        checked
                          ? "border-primary/40 bg-primary/10 text-foreground"
                          : "border-transparent bg-card/60 text-muted-foreground hover:bg-accent/50",
                      )}
                    >
                      {checked ? (
                        <CheckSquare className="h-3.5 w-3.5 shrink-0 text-primary" />
                      ) : (
                        <Square className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      )}
                      <span
                        className={cn(
                          "shrink-0 rounded border px-1 py-0.2 font-mono text-[9px] font-bold",
                          getMethodColorClass(ep.method),
                        )}
                      >
                        {ep.method}
                      </span>
                      <span className="truncate text-xs font-medium">
                        {ep.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Section 2: Parameter Injection */}
            <div className="space-y-3 rounded-xl border border-border bg-card/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label className="text-xs font-semibold">变量赋值</Label>
                <div className="flex rounded-lg border border-border bg-muted/50 p-0.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setParamMode("single")}
                    className={cn(
                      "rounded-md px-2.5 py-1 font-medium transition",
                      paramMode === "single"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground",
                    )}
                  >
                    单组参数
                  </button>
                  <button
                    type="button"
                    onClick={() => setParamMode("dataset")}
                    className={cn(
                      "rounded-md px-2.5 py-1 font-medium transition",
                      paramMode === "dataset"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground",
                    )}
                  >
                    批量列表
                  </button>
                </div>
              </div>

              {/* Aggregated Endpoint Variables */}
              {aggregatedVars.length > 0 ? (
                <div className="grid grid-cols-2 gap-3">
                  {aggregatedVars.map((v) => {
                    const overriddenByBatch =
                      paramMode === "dataset" && v.key === batchTargetKey;
                    return (
                      <div key={v.key} className="space-y-1">
                        <Label className="flex items-center justify-between text-[11px]">
                          <span>
                            {v.label || v.key}{" "}
                            <code className="font-mono text-primary">
                              {`{{${v.key}}}`}
                            </code>
                            {v.required && (
                              <span className="ml-0.5 text-rose-400">*</span>
                            )}
                          </span>
                          {overriddenByBatch && (
                            <span className="text-[10px] text-indigo-400">
                              使用下方列表
                            </span>
                          )}
                        </Label>
                        <Input
                          value={singleParams[v.key] ?? ""}
                          disabled={overriddenByBatch}
                          onChange={(e) =>
                            setSingleParams((p) => ({
                              ...p,
                              [v.key]: e.target.value,
                            }))
                          }
                          placeholder={
                            v.defaultValue || `输入 ${v.label || v.key}`
                          }
                          className="h-8 font-mono text-xs"
                        />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  所选接口未包含自定义变量，可按需添加附加参数。
                </p>
              )}

              {/* Dataset Multi-Row Mode */}
              {paramMode === "dataset" && (
                <div className="space-y-2 rounded-lg border border-indigo-500/25 bg-indigo-500/5 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-muted-foreground">目标变量：</span>
                      <Input
                        value={batchTargetKey}
                        onChange={(e) => setBatchTargetKey(e.target.value)}
                        className="h-7 w-36 font-mono text-xs"
                        placeholder="如 userId"
                      />
                    </div>
                    <span className="font-mono text-[11px] text-indigo-400">
                      共 {parsedDatasetRows.length} 行
                    </span>
                  </div>
                  <Textarea
                    value={batchLinesText}
                    onChange={(e) => setBatchLinesText(e.target.value)}
                    placeholder="每行输入一个参数值，或粘贴 JSON 对象数组"
                    className="min-h-[96px] font-mono text-xs"
                  />
                </div>
              )}

              {/* Extra Ad-hoc Global Variables */}
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">
                    附加参数（可选）
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 gap-1 text-[11px]"
                    onClick={() => setExtraParams((p) => [...p, ["", ""]])}
                  >
                    <Plus className="h-3 w-3" />
                    添加
                  </Button>
                </div>
                {extraParams.map(([k, val], i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={k}
                      onChange={(e) =>
                        setExtraParams((prev) =>
                          prev.map((row, idx) =>
                            idx === i ? [e.target.value, row[1]] : row,
                          ),
                        )
                      }
                      placeholder="变量名"
                      className="h-7 flex-1 font-mono text-xs"
                    />
                    <Input
                      value={val}
                      onChange={(e) =>
                        setExtraParams((prev) =>
                          prev.map((row, idx) =>
                            idx === i ? [row[0], e.target.value] : row,
                          ),
                        )
                      }
                      placeholder="变量值"
                      className="h-7 flex-1 font-mono text-xs"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() =>
                        setExtraParams((prev) =>
                          prev.filter((_, idx) => idx !== i),
                        )
                      }
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {/* Section 3: Concurrency & Pacing */}
            <div className="space-y-3.5 rounded-xl border border-border bg-card/60 p-4">
              <Label className="flex items-center gap-1.5 text-xs font-semibold">
                <SlidersHorizontal className="h-3.5 w-3.5 text-primary" />
                并发与调度
              </Label>

              {/* Concurrency Slider */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">并发数</span>
                  <div className="flex items-center gap-1.5">
                    {[1, 8, 16, 32, 64, 128].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setConcurrency(preset)}
                        className={cn(
                          "rounded px-1.5 py-0.5 font-mono text-[10px]",
                          concurrency === preset
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {preset}
                      </button>
                    ))}
                    <Input
                      type="number"
                      min={1}
                      max={512}
                      value={concurrency}
                      onChange={(e) =>
                        setConcurrency(
                          Math.max(1, Math.min(512, Number(e.target.value) || 1)),
                        )
                      }
                      className="h-7 w-20 text-right font-mono text-xs"
                    />
                  </div>
                </div>
                <Slider
                  min={1}
                  max={256}
                  step={1}
                  value={[Math.min(256, concurrency)]}
                  onValueChange={([v]) => setConcurrency(v)}
                />
              </div>

              <div className="grid grid-cols-4 gap-3 pt-1">
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">
                    执行轮次
                  </Label>
                  <Input
                    type="number"
                    min={1}
                    value={iterations}
                    onChange={(e) =>
                      setIterations(Math.max(1, Number(e.target.value) || 1))
                    }
                    className="h-8 font-mono text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">
                    请求间隔 (ms)
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    value={intervalMs}
                    onChange={(e) =>
                      setIntervalMs(Math.max(0, Number(e.target.value) || 0))
                    }
                    className="h-8 font-mono text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">
                    速率上限 (RPS)
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    value={maxRpsText}
                    onChange={(e) => setMaxRpsText(e.target.value)}
                    placeholder="不限"
                    className="h-8 font-mono text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">
                    超时 (ms) / 重试
                  </Label>
                  <div className="flex gap-1">
                    <Input
                      type="number"
                      min={200}
                      value={timeoutMs}
                      onChange={(e) =>
                        setTimeoutMs(
                          Math.max(200, Number(e.target.value) || 10000),
                        )
                      }
                      className="h-8 font-mono text-xs"
                    />
                    <Input
                      type="number"
                      min={0}
                      max={5}
                      value={retryCount}
                      onChange={(e) =>
                        setRetryCount(
                          Math.max(0, Math.min(5, Number(e.target.value) || 0)),
                        )
                      }
                      title="失败自动重试次数"
                      className="h-8 w-12 font-mono text-xs"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="flex items-center justify-between border-t border-border bg-muted/30 px-6 py-3.5 sm:justify-between">
          <div className="text-xs text-muted-foreground">
            总请求数：
            <span className="ml-1 font-mono font-semibold text-foreground">
              {formatNumber(totalPlanned)} 次
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={closeComposer}>
              取消
            </Button>
            <Button
              size="sm"
              className="gap-1.5 px-5"
              onClick={() => void handleLaunch()}
              disabled={submitting || selectedEndpoints.length === 0}
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              开始执行
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
