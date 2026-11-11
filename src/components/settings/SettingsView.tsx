import { useEffect, useState } from "react";
import { Cpu, FolderOpen, Save, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { useAppStore } from "@/stores/useAppStore";
import type { AppSettings } from "@/types/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";

export function SettingsView() {
  const { settings, runtimeInfo, saveSettings } = useAppStore();
  const [form, setForm] = useState<AppSettings>(settings);

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  const handleSave = async () => {
    try {
      await saveSettings(form);
      toast.success("全局引擎配置已保存");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <ScrollArea className="h-full w-full">
      <div className="mx-auto max-w-3xl space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold">
              <Settings2 className="h-4 w-4 text-primary" />
              Rust 执行引擎与客户端全局配置
            </h2>
            <p className="text-xs text-muted-foreground">
              配置默认并发度、超时阈值、HTTP/SOCKS5 代理及跨平台外观主题（数据纯本地保存）。
            </p>
          </div>
          <Button size="sm" className="gap-1.5" onClick={() => void handleSave()}>
            <Save className="h-3.5 w-3.5" />
            保存设置
          </Button>
        </div>

        {/* Engine Defaults */}
        <div className="space-y-4 rounded-xl border border-border bg-card p-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            网络与并发默认参数
          </h3>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">新建任务默认并发数</Label>
              <Input
                type="number"
                min={1}
                max={512}
                value={form.defaultConcurrency}
                onChange={(e) =>
                  setForm({
                    ...form,
                    defaultConcurrency: Math.max(
                      1,
                      Math.min(512, Number(e.target.value) || 16),
                    ),
                  })
                }
                className="h-8 font-mono text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">默认单次请求超时时间 (ms)</Label>
              <Input
                type="number"
                min={200}
                value={form.defaultTimeoutMs}
                onChange={(e) =>
                  setForm({
                    ...form,
                    defaultTimeoutMs: Math.max(
                      200,
                      Number(e.target.value) || 10000,
                    ),
                  })
                }
                className="h-8 font-mono text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">默认 User-Agent 请求头</Label>
              <Input
                value={form.defaultUserAgent}
                onChange={(e) =>
                  setForm({ ...form, defaultUserAgent: e.target.value })
                }
                placeholder="FluxPulse-Desktop/0.1.0"
                className="h-8 font-mono text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">
                全局网络代理 (支持 http:// 或 socks5://)
              </Label>
              <Input
                value={form.globalProxyUrl}
                onChange={(e) =>
                  setForm({ ...form, globalProxyUrl: e.target.value })
                }
                placeholder="留空直连，如 http://127.0.0.1:7890"
                className="h-8 font-mono text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">历史记录最大保留条数</Label>
              <Input
                type="number"
                min={5}
                max={500}
                value={form.maxHistoryRecords}
                onChange={(e) =>
                  setForm({
                    ...form,
                    maxHistoryRecords: Math.max(
                      5,
                      Math.min(500, Number(e.target.value) || 50),
                    ),
                  })
                }
                className="h-8 font-mono text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">界面外观主题</Label>
              <Select
                value={form.theme}
                onValueChange={(v) =>
                  setForm({ ...form, theme: v as AppSettings["theme"] })
                }
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dark">深色主题 (Dark)</SelectItem>
                  <SelectItem value="light">浅色主题 (Light)</SelectItem>
                  <SelectItem value="system">跟随操作系统 (System)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Native Runtime Diagnostics */}
        {runtimeInfo && (
          <div className="space-y-3 rounded-xl border border-border bg-card p-5">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Cpu className="h-3.5 w-3.5 text-primary" />
              本地运行环境信息 (macOS / Windows)
            </h3>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-lg bg-muted/40 p-3">
                <span className="text-[11px] text-muted-foreground">
                  操作系统与指令集架构
                </span>
                <div className="mt-0.5 font-mono font-semibold">
                  {runtimeInfo.os} ({runtimeInfo.arch}) · {runtimeInfo.cpuCores}{" "}
                  逻辑核心
                </div>
              </div>

              <div className="rounded-lg bg-muted/40 p-3">
                <span className="text-[11px] text-muted-foreground">
                  内置离线回显压测端点
                </span>
                <div className="mt-0.5 font-mono font-semibold text-primary selectable">
                  {runtimeInfo.mockBaseUrl}
                </div>
              </div>

              <div className="col-span-2 rounded-lg bg-muted/40 p-3">
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <FolderOpen className="h-3 w-3" />
                  纯本地配置与历史存储目录
                </span>
                <div className="mt-0.5 font-mono text-[11px] break-all selectable">
                  {runtimeInfo.dataDir}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
