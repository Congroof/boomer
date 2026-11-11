import { useMemo, useRef, useState } from "react";
import {
  Copy,
  Download,
  FileUp,
  FolderKanban,
  Play,
  Plus,
  Search,
  Sparkles,
  Terminal,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useEndpointStore } from "@/stores/useEndpointStore";
import { useTaskStore } from "@/stores/useTaskStore";
import { useAppStore } from "@/stores/useAppStore";
import { cn, getMethodColorClass } from "@/lib/utils";
import { exportEndpointsAsJson } from "@/lib/exportReport";
import type { EndpointConfig } from "@/types/endpoint";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CurlImportDialog } from "./CurlImportDialog";

export function EndpointListPane() {
  const {
    endpoints,
    selectedId,
    searchQuery,
    activeGroup,
    selectEndpoint,
    startNewEndpoint,
    duplicateEndpoint,
    deleteEndpoints,
    toggleEndpoint,
    importEndpoints,
    addDemoEndpoints,
    setSearchQuery,
    setActiveGroup,
  } = useEndpointStore();

  const openComposer = useTaskStore((s) => s.openComposer);
  const setActiveTab = useAppStore((s) => s.setActiveTab);

  const [curlOpen, setCurlOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const groups = useMemo(() => {
    const map = new Map<string, number>();
    for (const ep of endpoints) {
      const g = ep.group?.trim() || "默认分组";
      map.set(g, (map.get(g) ?? 0) + 1);
    }
    return Array.from(map.entries());
  }, [endpoints]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return endpoints.filter((ep) => {
      if (activeGroup !== "ALL" && (ep.group || "默认分组") !== activeGroup) {
        return false;
      }
      if (!q) return true;
      return (
        ep.name.toLowerCase().includes(q) ||
        ep.url.toLowerCase().includes(q) ||
        ep.method.toLowerCase().includes(q) ||
        ep.variables.some(
          (v) =>
            v.key.toLowerCase().includes(q) ||
            v.label.toLowerCase().includes(q),
        )
      );
    });
  }, [endpoints, activeGroup, searchQuery]);

  const handleImportJsonFile = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as EndpointConfig[] | EndpointConfig;
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      if (arr.length === 0 || !arr[0]?.url) {
        throw new Error("JSON 文件中未检测到合法的接口配置");
      }
      await importEndpoints(arr, false);
      toast.success(`成功导入 ${arr.length} 个接口配置`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "导入失败");
    } finally {
      e.target.value = "";
    }
  };

  const handleRunFiltered = () => {
    const enabledInView = filtered.filter((e) => e.enabled).map((e) => e.id);
    if (enabledInView.length === 0) {
      toast.error("当前筛选列表下没有已启用的接口");
      return;
    }
    setActiveTab("runner");
    openComposer(enabledInView);
  };

  return (
    <div className="flex h-full w-72 shrink-0 flex-col border-r border-border bg-card/40">
      {/* Header Actions */}
      <div className="space-y-2.5 border-b border-border p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <FolderKanban className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">接口库 ({endpoints.length})</h2>
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1 px-2 text-xs"
              onClick={() => setCurlOpen(true)}
              title="从 cURL 导入"
            >
              <Terminal className="h-3.5 w-3.5" />
              cURL
            </Button>
            <Button
              size="sm"
              className="h-7 gap-1 px-2.5 text-xs"
              onClick={() => startNewEndpoint()}
            >
              <Plus className="h-3.5 w-3.5" />
              新建
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索名称或 URL..."
            className="h-8 pl-8 text-xs"
          />
        </div>

        {/* Group Filter Chips */}
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => setActiveGroup("ALL")}
            className={cn(
              "rounded-md px-2 py-0.5 text-[11px] font-medium transition",
              activeGroup === "ALL"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            全部 ({endpoints.length})
          </button>
          {groups.map(([g, count]) => (
            <button
              key={g}
              type="button"
              onClick={() => setActiveGroup(g)}
              className={cn(
                "max-w-[140px] truncate rounded-md px-2 py-0.5 text-[11px] font-medium transition",
                activeGroup === g
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground",
              )}
              title={g}
            >
              {g} ({count})
            </button>
          ))}
        </div>
      </div>

      {/* Endpoint Items */}
      <ScrollArea className="flex-1">
        <div className="space-y-1 p-2">
          {filtered.length === 0 ? (
            <div className="space-y-2 py-10 text-center text-xs text-muted-foreground">
              <p>暂无匹配的接口</p>
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={() => void addDemoEndpoints()}
              >
                <Sparkles className="h-3.5 w-3.5" />
                载入示例接口
              </Button>
            </div>
          ) : (
            filtered.map((ep) => {
              const selected = selectedId === ep.id;
              return (
                <div
                  key={ep.id}
                  onClick={() => selectEndpoint(ep.id)}
                  className={cn(
                    "group cursor-pointer rounded-lg border p-2.5 transition-all",
                    selected
                      ? "border-primary/40 bg-primary/10 shadow-sm"
                      : "border-transparent hover:border-border hover:bg-accent/50",
                    !ep.enabled && "opacity-60",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span
                        className={cn(
                          "shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px] font-bold",
                          getMethodColorClass(ep.method),
                        )}
                      >
                        {ep.method}
                      </span>
                      <span className="truncate text-xs font-medium">
                        {ep.name}
                      </span>
                    </div>
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="flex shrink-0 items-center"
                    >
                      <Switch
                        checked={ep.enabled}
                        onCheckedChange={(checked) =>
                          void toggleEndpoint(ep.id, checked)
                        }
                      />
                    </div>
                  </div>

                  <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                    {ep.url}
                  </p>

                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="flex flex-wrap gap-1 overflow-hidden">
                      {ep.variables.slice(0, 3).map((v) => (
                        <span
                          key={v.key}
                          className="rounded bg-indigo-500/12 px-1.5 py-0.5 font-mono text-[10px] text-indigo-400"
                        >
                          {`{{${v.key}}}`}
                        </span>
                      ))}
                      {ep.variables.length > 3 && (
                        <span className="text-[10px] text-muted-foreground">
                          +{ep.variables.length - 3}
                        </span>
                      )}
                    </div>

                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      <button
                        type="button"
                        onClick={() => void duplicateEndpoint(ep)}
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        title="复制副本"
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void deleteEndpoints([ep.id]);
                          toast.success(`已删除接口：${ep.name}`);
                        }}
                        className="rounded p-1 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                        title="删除接口"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>

      {/* Footer Batch Operations */}
      <div className="space-y-2 border-t border-border p-2.5">
        <Button
          variant="secondary"
          size="sm"
          className="h-8 w-full gap-1.5 text-xs"
          onClick={handleRunFiltered}
        >
          <Play className="h-3.5 w-3.5 text-emerald-500" />
          批量运行 ({filtered.filter((e) => e.enabled).length})
        </Button>

        <div className="grid grid-cols-2 gap-1.5">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => void handleImportJsonFile(e)}
          />
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-[11px]"
            onClick={() => fileInputRef.current?.click()}
          >
            <FileUp className="h-3 w-3" />
            导入
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-[11px]"
            onClick={() => {
              exportEndpointsAsJson(endpoints);
              toast.success("已导出接口配置");
            }}
            disabled={endpoints.length === 0}
          >
            <Download className="h-3 w-3" />
            导出
          </Button>
        </div>
      </div>

      <CurlImportDialog open={curlOpen} onOpenChange={setCurlOpen} />
    </div>
  );
}
