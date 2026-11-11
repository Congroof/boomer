import { useEffect, useState } from "react";
import {
  Braces,
  CheckCircle2,
  FlaskConical,
  Loader2,
  Play,
  Plus,
  Rocket,
  Save,
  Sparkles,
  Trash2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useEndpointStore } from "@/stores/useEndpointStore";
import { useTaskStore } from "@/stores/useTaskStore";
import { useAppStore } from "@/stores/useAppStore";
import type { BodyType, HttpMethod } from "@/types/endpoint";
import { BUILTIN_TEMPLATE_TOKENS } from "@/lib/templateVars";
import { formatBytes } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { KeyValueEditor } from "./KeyValueEditor";

const HTTP_METHODS: HttpMethod[] = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
];

const HEADER_PRESETS = [
  { label: "JSON", key: "Content-Type", value: "application/json" },
  { label: "Bearer Token", key: "Authorization", value: "Bearer {{token}}" },
  { label: "Request ID", key: "X-Request-Id", value: "{{$uuid}}" },
  {
    label: "User-Agent",
    key: "User-Agent",
    value:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
  },
];

export function EndpointEditorPane() {
  const {
    draft,
    isDirty,
    testing,
    lastTestResult,
    updateDraft,
    saveDraft,
    testCurrentDraft,
    clearTestResult,
    startNewEndpoint,
  } = useEndpointStore();

  const openComposer = useTaskStore((s) => s.openComposer);
  const setActiveTab = useAppStore((s) => s.setActiveTab);

  const [testParams, setTestParams] = useState<Record<string, string>>({});
  const [debugOpen, setDebugOpen] = useState(false);

  // Sync default test params when draft variables change
  useEffect(() => {
    if (!draft) return;
    setTestParams((prev) => {
      const next: Record<string, string> = {};
      for (const v of draft.variables) {
        next[v.key] = prev[v.key] ?? v.defaultValue ?? "";
      }
      return next;
    });
  }, [draft?.id, draft?.variables.length]);

  if (!draft) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <div className="rounded-2xl bg-primary/10 p-4 text-primary">
          <Braces className="h-7 w-7" />
        </div>
        <h3 className="text-sm font-semibold">选择或新建接口</h3>
        <p className="max-w-sm text-xs text-muted-foreground leading-relaxed">
          从左侧列表选择已有接口进行编辑，或创建一个新的请求配置。
        </p>
        <Button size="sm" onClick={() => startNewEndpoint()} className="gap-1.5">
          <Plus className="h-4 w-4" />
          新建接口
        </Button>
      </div>
    );
  }

  const handleSave = async () => {
    try {
      const saved = await saveDraft();
      toast.success(`已保存：${saved.name}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSendTest = async () => {
    setDebugOpen(true);
    try {
      const res = await testCurrentDraft(testParams);
      if (res.success) {
        toast.success(`请求成功 (${res.statusCode} · ${res.latencyMs}ms)`);
      } else {
        toast.warning(`未通过断言：${res.failureReason ?? res.statusText}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const handleLaunchTaskForEndpoint = async () => {
    try {
      const saved = isDirty || !draft.id ? await saveDraft() : draft;
      setActiveTab("runner");
      openComposer([saved.id]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const handleCopyToken = async (token: string) => {
    try {
      await navigator.clipboard.writeText(token);
      toast.success(`已复制 ${token}`);
    } catch {
      toast.info(token);
    }
  };

  const handleFormatJson = () => {
    try {
      const pretty = JSON.stringify(JSON.parse(draft.body.rawContent), null, 2);
      updateDraft((d) => {
        d.body.rawContent = pretty;
        return d;
      });
      toast.success("已格式化");
    } catch {
      toast.error("JSON 语法有误，无法格式化");
    }
  };

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
      {/* Top Meta Toolbar */}
      <div className="flex items-center justify-between gap-3 border-b border-border bg-card/50 px-5 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Input
            value={draft.name}
            title={draft.name}
            onChange={(e) =>
              updateDraft((d) => {
                d.name = e.target.value;
                return d;
              })
            }
            placeholder="接口名称"
            className="h-8 min-w-0 flex-[1.6] text-xs font-medium"
          />
          <Input
            value={draft.group}
            title={draft.group}
            onChange={(e) =>
              updateDraft((d) => {
                d.group = e.target.value;
                return d;
              })
            }
            placeholder="分组"
            className="h-8 min-w-0 max-w-[220px] flex-1 text-xs"
          />
          {isDirty && (
            <Badge
              variant="outline"
              className="shrink-0 border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-400"
            >
              未保存
            </Badge>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => setDebugOpen((v) => !v)}
          >
            <FlaskConical className="h-3.5 w-3.5 text-sky-400" />
            {debugOpen ? "收起调试" : "调试"}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => void handleLaunchTaskForEndpoint()}
          >
            <Rocket className="h-3.5 w-3.5 text-indigo-400" />
            并发运行
          </Button>
          <Button
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => void handleSave()}
          >
            <Save className="h-3.5 w-3.5" />
            保存
          </Button>
        </div>
      </div>

      {/* Method + URL Bar */}
      <div className="space-y-2 border-b border-border bg-background/60 px-5 py-3">
        <div className="flex items-center gap-2">
          <Select
            value={draft.method}
            onValueChange={(val) =>
              updateDraft((d) => {
                d.method = val as HttpMethod;
                return d;
              })
            }
          >
            <SelectTrigger className="h-9 w-28 font-mono text-xs font-bold">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HTTP_METHODS.map((m) => (
                <SelectItem key={m} value={m} className="font-mono text-xs">
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            value={draft.url}
            onChange={(e) =>
              updateDraft((d) => {
                d.url = e.target.value;
                return d;
              })
            }
            placeholder="https://api.example.com/v1/resource"
            className="h-9 flex-1 font-mono text-xs"
          />

          <Button
            variant="default"
            size="sm"
            className="h-9 gap-1.5 px-4 text-xs"
            onClick={() => void handleSendTest()}
            disabled={testing}
          >
            {testing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5 fill-current" />
            )}
            发送
          </Button>
        </div>

        {/* Builtin Variable Quick Copy Strip */}
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="flex items-center gap-1 text-muted-foreground">
            <Sparkles className="h-3 w-3 text-primary" />
            内置变量：
          </span>
          {BUILTIN_TEMPLATE_TOKENS.map((b) => (
            <button
              key={b.token}
              type="button"
              onClick={() => void handleCopyToken(b.token)}
              title={`${b.label}（如 ${b.example}）`}
              className="rounded border border-border/70 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground transition hover:border-primary/40 hover:text-primary"
            >
              {b.token}
            </button>
          ))}
        </div>
      </div>

      {/* Main Editor Body + Optional Inline Debug Drawer */}
      <ScrollArea className="min-w-0 flex-1">
        <div className="min-w-0 space-y-5 p-5">
          <Tabs defaultValue="variables" className="w-full">
            <TabsList className="grid w-full grid-cols-6">
              <TabsTrigger value="variables" className="text-xs">
                变量 ({draft.variables.length})
              </TabsTrigger>
              <TabsTrigger value="query" className="text-xs">
                Query ({draft.queryParams.length})
              </TabsTrigger>
              <TabsTrigger value="headers" className="text-xs">
                Headers ({draft.headers.length})
              </TabsTrigger>
              <TabsTrigger value="body" className="text-xs">
                Body
              </TabsTrigger>
              <TabsTrigger value="assertions" className="text-xs">
                断言
              </TabsTrigger>
              <TabsTrigger value="advanced" className="text-xs">
                高级
              </TabsTrigger>
            </TabsList>

            {/* Tab 1: Custom Variables Schema */}
            <TabsContent value="variables" className="mt-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  在请求中使用{" "}
                  <code className="rounded bg-muted px-1 py-0.5 font-mono text-foreground">
                    {"{{变量名}}"}
                  </code>{" "}
                  可自动提取至列表
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={() =>
                    updateDraft((d) => {
                      const idx = d.variables.length + 1;
                      d.variables.push({
                        key: `param${idx}`,
                        label: `参数 ${idx}`,
                        defaultValue: "",
                        required: true,
                        description: "",
                      });
                      return d;
                    })
                  }
                >
                  <Plus className="h-3.5 w-3.5" />
                  添加变量
                </Button>
              </div>

              {draft.variables.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/70 py-6 text-center text-xs text-muted-foreground">
                  暂无自定义变量
                </div>
              ) : (
                <div className="overflow-hidden rounded-lg border border-border">
                  <div className="grid grid-cols-[1fr_1fr_1.2fr_64px_1.2fr_40px] items-center gap-2 border-b border-border bg-muted/40 px-3 py-1.5 text-[11px] font-medium text-muted-foreground">
                    <span>变量名</span>
                    <span>显示名</span>
                    <span>默认值</span>
                    <span>必填</span>
                    <span>备注</span>
                    <span />
                  </div>
                  <div className="divide-y divide-border/60">
                    {draft.variables.map((v, i) => (
                      <div
                        key={`${v.key}-${i}`}
                        className="grid grid-cols-[1fr_1fr_1.2fr_64px_1.2fr_40px] items-center gap-2 px-3 py-2"
                      >
                        <Input
                          value={v.key}
                          onChange={(e) =>
                            updateDraft((d) => {
                              d.variables[i].key = e.target.value.trim();
                              return d;
                            })
                          }
                          className="h-8 font-mono text-xs"
                          placeholder="如 userId"
                        />
                        <Input
                          value={v.label}
                          onChange={(e) =>
                            updateDraft((d) => {
                              d.variables[i].label = e.target.value;
                              return d;
                            })
                          }
                          className="h-8 text-xs"
                          placeholder="显示名称"
                        />
                        <Input
                          value={v.defaultValue}
                          onChange={(e) =>
                            updateDraft((d) => {
                              d.variables[i].defaultValue = e.target.value;
                              return d;
                            })
                          }
                          className="h-8 font-mono text-xs"
                          placeholder="默认值"
                        />
                        <div className="flex items-center">
                          <Switch
                            checked={v.required}
                            onCheckedChange={(checked) =>
                              updateDraft((d) => {
                                d.variables[i].required = checked;
                                return d;
                              })
                            }
                          />
                        </div>
                        <Input
                          value={v.description}
                          onChange={(e) =>
                            updateDraft((d) => {
                              d.variables[i].description = e.target.value;
                              return d;
                            })
                          }
                          className="h-8 text-xs"
                          placeholder="备注（可选）"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() =>
                            updateDraft((d) => {
                              d.variables.splice(i, 1);
                              return d;
                            })
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>

            {/* Tab 2: Query Params */}
            <TabsContent value="query" className="mt-4">
              <KeyValueEditor
                items={draft.queryParams}
                onChange={(next) =>
                  updateDraft((d) => {
                    d.queryParams = next;
                    return d;
                  })
                }
                presets={[
                  { label: "分页 page", key: "page", value: "1" },
                  {
                    label: "时间戳 ts",
                    key: "ts",
                    value: "{{$timestamp_ms}}",
                  },
                ]}
              />
            </TabsContent>

            {/* Tab 3: Headers */}
            <TabsContent value="headers" className="mt-4">
              <KeyValueEditor
                items={draft.headers}
                onChange={(next) =>
                  updateDraft((d) => {
                    d.headers = next;
                    return d;
                  })
                }
                keyPlaceholder="Header 名称"
                valuePlaceholder="Header 值（支持 {{变量}}）"
                presets={HEADER_PRESETS}
              />
            </TabsContent>

            {/* Tab 4: Request Body */}
            <TabsContent value="body" className="mt-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  {(
                    [
                      ["none", "None"],
                      ["json", "JSON"],
                      ["formUrlencoded", "Form URL-Encoded"],
                      ["multipart", "Multipart"],
                      ["raw", "Raw"],
                    ] as [BodyType, string][]
                  ).map(([type, label]) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() =>
                        updateDraft((d) => {
                          d.body.bodyType = type;
                          return d;
                        })
                      }
                      className={`rounded-md border px-2.5 py-1 text-xs font-medium transition ${
                        draft.body.bodyType === type
                          ? "border-primary bg-primary/15 text-primary"
                          : "border-border bg-muted/40 text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {draft.body.bodyType === "json" && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={handleFormatJson}
                  >
                    格式化
                  </Button>
                )}
              </div>

              {draft.body.bodyType === "none" && (
                <div className="rounded-lg border border-dashed border-border/70 py-6 text-center text-xs text-muted-foreground">
                  无请求体
                </div>
              )}

              {(draft.body.bodyType === "json" ||
                draft.body.bodyType === "raw") && (
                <div className="space-y-2">
                  {draft.body.bodyType === "raw" && (
                    <div className="flex items-center gap-2">
                      <Label className="text-xs">Content-Type:</Label>
                      <Input
                        value={draft.body.rawContentType}
                        onChange={(e) =>
                          updateDraft((d) => {
                            d.body.rawContentType = e.target.value;
                            return d;
                          })
                        }
                        className="h-7 w-64 font-mono text-xs"
                        placeholder="text/plain; charset=utf-8"
                      />
                    </div>
                  )}
                  <Textarea
                    value={draft.body.rawContent}
                    onChange={(e) =>
                      updateDraft((d) => {
                        d.body.rawContent = e.target.value;
                        return d;
                      })
                    }
                    placeholder={
                      draft.body.bodyType === "json"
                        ? '{\n  "id": "{{id}}",\n  "requestId": "{{$uuid}}"\n}'
                        : "输入原始文本内容"
                    }
                    className="min-h-[200px] font-mono text-xs leading-relaxed"
                  />
                </div>
              )}

              {(draft.body.bodyType === "formUrlencoded" ||
                draft.body.bodyType === "multipart") && (
                <KeyValueEditor
                  items={draft.body.formItems}
                  onChange={(next) =>
                    updateDraft((d) => {
                      d.body.formItems = next;
                      return d;
                    })
                  }
                />
              )}
            </TabsContent>

            {/* Tab 5: Assertions */}
            <TabsContent value="assertions" className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">状态码范围</Label>
                  <Input
                    value={draft.assertions.statusCodes}
                    onChange={(e) =>
                      updateDraft((d) => {
                        d.assertions.statusCodes = e.target.value;
                        return d;
                      })
                    }
                    placeholder="如 200-299 或 200,201"
                    className="h-8 font-mono text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">最大耗时阈值 (ms)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={draft.assertions.maxLatencyMs ?? ""}
                    onChange={(e) =>
                      updateDraft((d) => {
                        const val = Number(e.target.value);
                        d.assertions.maxLatencyMs =
                          e.target.value === "" || val <= 0 ? null : val;
                        return d;
                      })
                    }
                    placeholder="不限"
                    className="h-8 font-mono text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">响应包含关键字</Label>
                  <Input
                    value={draft.assertions.bodyContains}
                    onChange={(e) =>
                      updateDraft((d) => {
                        d.assertions.bodyContains = e.target.value;
                        return d;
                      })
                    }
                    placeholder='可选，如 "ok"'
                    className="h-8 font-mono text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">响应不包含关键字</Label>
                  <Input
                    value={draft.assertions.bodyNotContains}
                    onChange={(e) =>
                      updateDraft((d) => {
                        d.assertions.bodyNotContains = e.target.value;
                        return d;
                      })
                    }
                    placeholder='可选，如 "error"'
                    className="h-8 font-mono text-xs"
                  />
                </div>
              </div>

              {/* JSON Path Assertions */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">JSON 字段匹配</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 text-xs"
                    onClick={() =>
                      updateDraft((d) => {
                        d.assertions.jsonAssertions.push({
                          path: "code",
                          expected: "0",
                        });
                        return d;
                      })
                    }
                  >
                    <Plus className="h-3.5 w-3.5" />
                    添加规则
                  </Button>
                </div>

                {draft.assertions.jsonAssertions.map((rule, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Input
                      value={rule.path}
                      onChange={(e) =>
                        updateDraft((d) => {
                          d.assertions.jsonAssertions[idx].path =
                            e.target.value;
                          return d;
                        })
                      }
                      placeholder="字段路径（如 code 或 data.status）"
                      className="h-8 flex-1 font-mono text-xs"
                    />
                    <span className="font-mono text-xs text-muted-foreground">
                      ==
                    </span>
                    <Input
                      value={rule.expected}
                      onChange={(e) =>
                        updateDraft((d) => {
                          d.assertions.jsonAssertions[idx].expected =
                            e.target.value;
                          return d;
                        })
                      }
                      placeholder="期望值"
                      className="h-8 flex-1 font-mono text-xs"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() =>
                        updateDraft((d) => {
                          d.assertions.jsonAssertions.splice(idx, 1);
                          return d;
                        })
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </TabsContent>

            {/* Tab 6: Advanced Options */}
            <TabsContent value="advanced" className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">超时时间 (ms)</Label>
                  <Input
                    type="number"
                    min={100}
                    value={draft.timeoutMs ?? ""}
                    onChange={(e) =>
                      updateDraft((d) => {
                        const v = Number(e.target.value);
                        d.timeoutMs =
                          e.target.value === "" || v <= 0 ? null : v;
                        return d;
                      })
                    }
                    placeholder="默认跟随全局设置"
                    className="h-8 font-mono text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">备注</Label>
                  <Input
                    value={draft.description}
                    onChange={(e) =>
                      updateDraft((d) => {
                        d.description = e.target.value;
                        return d;
                      })
                    }
                    placeholder="可选说明"
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              <div className="flex items-center gap-8 pt-1">
                <label className="flex items-center gap-2.5 text-xs">
                  <Switch
                    checked={draft.followRedirects}
                    onCheckedChange={(c) =>
                      updateDraft((d) => {
                        d.followRedirects = c;
                        return d;
                      })
                    }
                  />
                  <span>跟随重定向</span>
                </label>

                <label className="flex items-center gap-2.5 text-xs">
                  <Switch
                    checked={draft.verifySsl}
                    onCheckedChange={(c) =>
                      updateDraft((d) => {
                        d.verifySsl = c;
                        return d;
                      })
                    }
                  />
                  <span>校验 SSL 证书</span>
                </label>
              </div>
            </TabsContent>
          </Tabs>

          {/* Inline Single-Request Debugger Panel */}
          {(debugOpen || lastTestResult) && (
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FlaskConical className="h-4 w-4 text-sky-400" />
                  <h4 className="text-xs font-semibold">单次调试</h4>
                </div>
                <div className="flex items-center gap-2">
                  {lastTestResult && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[11px]"
                      onClick={clearTestResult}
                    >
                      清空
                    </Button>
                  )}
                  <Button
                    size="sm"
                    className="h-7 gap-1 text-xs"
                    onClick={() => void handleSendTest()}
                    disabled={testing}
                  >
                    {testing ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Play className="h-3 w-3 fill-current" />
                    )}
                    发送
                  </Button>
                </div>
              </div>

              {/* Test Parameter Inputs */}
              {draft.variables.length > 0 && (
                <div className="grid grid-cols-2 gap-2.5 rounded-lg bg-muted/40 p-3 md:grid-cols-3">
                  {draft.variables.map((v) => (
                    <div key={v.key} className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">
                        {v.label || v.key}{" "}
                        <code className="font-mono text-primary">{`{{${v.key}}}`}</code>
                      </Label>
                      <Input
                        value={testParams[v.key] ?? ""}
                        onChange={(e) =>
                          setTestParams((p) => ({
                            ...p,
                            [v.key]: e.target.value,
                          }))
                        }
                        placeholder={v.defaultValue || `输入 ${v.key}`}
                        className="h-7 font-mono text-xs"
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Test Result Output */}
              {lastTestResult && (
                <div className="space-y-2.5 pt-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {lastTestResult.success ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-0.5 font-medium text-emerald-400">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        通过
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-md bg-rose-500/15 px-2 py-0.5 font-medium text-rose-400">
                        <XCircle className="h-3.5 w-3.5" />
                        {lastTestResult.failureReason ?? "请求失败"}
                      </span>
                    )}
                    <Badge variant="secondary" className="font-mono text-[11px]">
                      {lastTestResult.statusCode ?? "ERR"}{" "}
                      {lastTestResult.statusText}
                    </Badge>
                    <Badge variant="outline" className="font-mono text-[11px]">
                      {lastTestResult.latencyMs} ms
                    </Badge>
                    <Badge variant="outline" className="font-mono text-[11px]">
                      {formatBytes(lastTestResult.sizeBytes)}
                    </Badge>
                  </div>

                  <div className="rounded-md bg-muted/50 px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground break-all">
                    {lastTestResult.resolvedUrl}
                  </div>

                  <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-border bg-background p-3 font-mono text-xs leading-relaxed selectable">
                    {(() => {
                      const raw = lastTestResult.responseBody;
                      if (!raw) return "(空响应)";
                      try {
                        return JSON.stringify(JSON.parse(raw), null, 2);
                      } catch {
                        return raw;
                      }
                    })()}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
