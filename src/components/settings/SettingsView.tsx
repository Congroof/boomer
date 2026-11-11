import { useEffect, useState } from "react";
import { Save, Settings2 } from "lucide-react";
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
      toast.success("设置已保存");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <ScrollArea className="h-full w-full">
      <div className="mx-auto max-w-2xl space-y-6 p-6">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-bold">
            <Settings2 className="h-4 w-4 text-primary" />
            设置
          </h2>
          <Button size="sm" className="gap-1.5" onClick={() => void handleSave()}>
            <Save className="h-3.5 w-3.5" />
            保存
          </Button>
        </div>

        {/* General & Network Defaults */}
        <div className="space-y-4 rounded-xl border border-border bg-card p-5">
          <h3 className="text-xs font-semibold text-muted-foreground">
            请求与任务默认项
          </h3>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">默认并发数</Label>
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
              <Label className="text-xs">默认超时时间 (ms)</Label>
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
              <Label className="text-xs">默认 User-Agent</Label>
              <Input
                value={form.defaultUserAgent}
                onChange={(e) =>
                  setForm({ ...form, defaultUserAgent: e.target.value })
                }
                placeholder="Pulse/0.1.0"
                className="h-8 font-mono text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">网络代理</Label>
              <Input
                value={form.globalProxyUrl}
                onChange={(e) =>
                  setForm({ ...form, globalProxyUrl: e.target.value })
                }
                placeholder="http://127.0.0.1:7890"
                className="h-8 font-mono text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">历史记录上限</Label>
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
              <Label className="text-xs">外观主题</Label>
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
                  <SelectItem value="dark">深色</SelectItem>
                  <SelectItem value="light">浅色</SelectItem>
                  <SelectItem value="system">跟随系统</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="text-right font-mono text-[11px] text-muted-foreground">
          Pulse v{runtimeInfo?.appVersion ?? "0.1.0"}
        </div>
      </div>
    </ScrollArea>
  );
}
