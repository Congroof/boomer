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
  ShieldCheck,
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
  { label: "Trace ID", key: "X-Request-Id", value: "{{$uuid}}" },
  {
    label: "Chrome UA",
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
          <Braces className="h-8 w-8" />
        </div>
        <h3 className="text-base font-semibold">选择或录入一个 HTTP 接口</h3>
        <p className="max-w-md text-xs text-muted-foreground leading-relaxed">
          支持 GET / POST / PUT / DELETE 等全部标准方法，可在 URL、Query、Headers、Body 任意位置使用{" "}
          <code className="rounded bg-muted px-1 font-mono text-primary">
            {"{{phone}}"}
          </code>{" "}
          自定义注入变量或{" "}
          <code className="rounded bg-muted px-1 font-mono text-primary">
            {"{{$uuid}}"}
          </code>{" "}
          动态函数。
        </p>
        <Button size="sm" onClick={() => startNewEndpoint()} className="gap-1.5">
          <Plus className="h-4 w-4" />
          新建第一个接口
        </Button>
      </div>
    );
  }

  const handleSave = async () => {
    try {
      const saved = await saveDraft();
      toast.success(`已保存接口：${saved.name}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSendTest = async () => {
    setDebugOpen(true);
    try {
      const res = await testCurrentDraft(testParams);
      if (res.success) {
        toast.success(`调试请求成功 (${res.statusCode} · ${res.latencyMs}ms)`);
      } else {
        toast.warning(`请求未通过断言：${res.failureReason ?? res.statusText}`);
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
      toast.success(`已复制占位符 ${token}，可粘贴至 URL / Header / Body`);
    } catch {
      toast.info(`占位符: ${token}`);
    }
  };

  const handleFormatJson = () => {
    try {
      const pretty = JSON.stringify(JSON.parse(draft.body.rawContent), null, 2);
      updateDraft((d) => {
        d.body.rawContent = pretty;
        return d;
      });
      toast.success("JSON 已格式化");
    } catch {
      toast.error("当前 JSON 语法无法直接格式化（若含未加引号的模板变量请检查引号）");
    }
  };

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      {/* Top Meta Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card/50 px-5 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <Input
            value={draft.name}
            onChange={(e) =>
              updateDraft((d) => {
                d.name = e.target.value;
                return d;
              })
            }
            placeholder="接口名称（如：登录短信下发接口）"
            className="h-8 max-w-xs font-medium text-xs"
          />
          <Input
            value={draft.group}
            onChange={(e) =>
              updateDraft((d) => {
                d.group = e.target.value;
                return d;
              })
            }
            placeholder="所属分组"
            className="h-8 w-40 text-xs"
          />
          {isDirty && (
            <Badge
              variant="outline"
              className="border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-400"
            >
              未保存修改
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => setDebugOpen((v) => !v)}
          >
            <FlaskConical className="h-3.5 w-3.5 text-sky-400" />
            {debugOpen ? "收起调试台" : "单次调试"}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => void handleLaunchTaskForEndpoint()}
          >
            <Rocket className="h-3.5 w-3.5 text-indigo-400" />
            并发执行此接口
          </Button>
          <Button
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => void handleSave()}
          >
            <Save className="h-3.5 w-3.5" />
            保存接口
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
            placeholder="https://api.example.com/v1/endpoint?phone={{phone}}"
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
            发送测试
          </Button>
        </div>

        {/* Builtin Variable Quick Copy Strip */}
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="flex items-center gap-1 text-muted-foreground">
            <Sparkles className="h-3 w-3 text-primary" />
            点击复制动态函数：
          </span>
          {BUILTIN_TEMPLATE_TOKENS.map((b) => (
            <button
              key={b.token}
              type="button"
              onClick={() => void handleCopyToken(b.token)}
              title={`${b.label}（示例: ${b.example}）`}
              className="rounded border border-border/70 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground transition hover:border-primary/40 hover:text-primary"
            >
              {b.token}
            </button>
          ))}
        </div>
      </div>

      {/* Main Editor Body + Optional Inline Debug Drawer */}
      <ScrollArea className="flex-1">
        <div className="space-y-5 p-5">
          <Tabs defaultValue="variables" className="w-full">
            <TabsList className="grid w-full grid-cols-6">
              <TabsTrigger value="variables" className="text-xs">
                自定义参数 ({draft.variables.length})
              </TabsTrigger>
              <TabsTrigger value="query" className="text-xs">
                Query ({draft.queryParams.length})
              </TabsTrigger>
              <TabsTrigger value="headers" className="text-xs">
                Headers ({draft.headers.length})
              </TabsTrigger>
              <TabsTrigger value="body" className="text-xs">
                Body ({draft.body.bodyType})
              </TabsTrigger>
              <TabsTrigger value="assertions" className="text-xs">
                成功断言
              </TabsTrigger>
              <TabsTrigger value="advanced" className="text-xs">
                高级配置
              </TabsTrigger>
            </TabsList>

            {/* Tab 1: Custom Variables Schema */}
            <TabsContent value="variables" className="mt-4 space-y-3">
              <div className="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/5 px-3.5 py-2.5 text-xs">
                <div className="space-y-0.5">
                  <p className="font-medium text-foreground">
                    接口自定义注入变量定义（自动识别{" "}
                    <code className="font-mono text-primary">{"{{变量名}}"}</code>）
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    在 URL、Query、Headers 或 Body 中输入如{" "}
                    <code className="font-mono">{"{{phone}}"}</code>、
                    <code className="font-mono">{"{{userId}}"}</code>{" "}
                    将自动提取到此处；启动并发任务时将生成对应参数注入表单。
                  </p>
                </div>
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
                        label: `自定义参数${idx}`,
                        defaultValue: "",
                        required: true,
                        description: "",
                      });
                      return d;
                    })
                  }
                >
                  <Plus className="h-3.5 w-3.5" />
                  手动声明变量
                </Button>
              </div>

              {draft.variables.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border py-8 text-center text-xs text-muted-foreground">
                  当前接口暂未声明自定义变量。你可以在 URL 或 Body 中写入{" "}
                  <code className="rounded bg-muted px-1 font-mono text-primary">
                    {"{{phone}}"}
                  </code>{" "}
                  自动生成变量项。
                </div>
              ) : (
                <div className="overflow-hidden rounded-lg border border-border">
                  <div className="grid grid-cols-[1fr_1fr_1.2fr_64px_1.2fr_40px] items-center gap-2 border-b border-border bg-muted/40 px-3 py-1.5 text-[11px] font-medium text-muted-foreground">
                    <span>占位符变量名</span>
                    <span>显示名称 (Label)</span>
                    <span>默认值 (Default)</span>
                    <span>必填</span>
                    <span>参数说明</span>
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
                          placeholder="如 phone"
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
                          placeholder="如 手机号"
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
                          placeholder="默认测试值"
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
                          placeholder="参数用途说明"
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
                  { label: "手机号 phone", key: "phone", value: "{{phone}}" },
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
                keyPlaceholder="Header 名称 (如 Authorization)"
                valuePlaceholder="Header 值，支持 {{token}}"
                presets={HEADER_PRESETS}
              />
            </TabsContent>

            {/* Tab 4: Request Body */}
            <TabsContent value="body" className="mt-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  {(
                    [
                      ["none", "无 Body (None)"],
                      ["json", "JSON"],
                      ["formUrlencoded", "x-www-form-urlencoded"],
                      ["multipart", "Multipart Form"],
                      ["raw", "Raw 文本"],
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
                    格式化 JSON
                  </Button>
                )}
              </div>

              {draft.body.bodyType === "none" && (
                <div className="rounded-lg border border-dashed border-border py-8 text-center text-xs text-muted-foreground">
                  当前请求不携带请求体（适用于 GET / HEAD 等请求）
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
                        ? '{\n  "phone": "{{phone}}",\n  "requestId": "{{$uuid}}"\n}'
                        : "输入原始请求体文本，支持 {{变量}}"
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
                  presets={[
                    { label: "手机号 phone", key: "phone", value: "{{phone}}" },
                  ]}
                />
              )}
            </TabsContent>

            {/* Tab 5: Assertions (Success/Failure Rules) */}
            <TabsContent value="assertions" className="mt-4 space-y-4">
              <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3.5 py-2.5 text-xs">
                <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-500" />
                <span className="text-muted-foreground">
                  Rust 执行引擎会针对每次并发响应自动运行以下规则；全部满足记为
                  <strong className="mx-1 text-emerald-500">成功</strong>
                  ，任一不满足记为
                  <strong className="mx-1 text-rose-400">失败</strong>
                  并归类失败原因。
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">期望 HTTP 状态码范围</Label>
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
                  <p className="text-[11px] text-muted-foreground">
                    支持区间（200-299）或逗号分隔（200,201,204）
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">最大允许耗时阈值 (ms，可选)</Label>
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
                    placeholder="留空表示不限制耗时 SLA"
                    className="h-8 font-mono text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">响应体必须包含关键字 (可选)</Label>
                  <Input
                    value={draft.assertions.bodyContains}
                    onChange={(e) =>
                      updateDraft((d) => {
                        d.assertions.bodyContains = e.target.value;
                        return d;
                      })
                    }
                    placeholder='例如 "ok" 或 "success":true'
                    className="h-8 font-mono text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">响应体不得包含关键字 (可选)</Label>
                  <Input
                    value={draft.assertions.bodyNotContains}
                    onChange={(e) =>
                      updateDraft((d) => {
                        d.assertions.bodyNotContains = e.target.value;
                        return d;
                      })
                    }
                    placeholder='例如 "error" 或 "频繁"'
                    className="h-8 font-mono text-xs"
                  />
                </div>
              </div>

              {/* JSON Path Assertions */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">
                    JSON 字段精确断言（支持点号路径如{" "}
                    <code className="font-mono text-primary">code</code> 或{" "}
                    <code className="font-mono text-primary">data.status</code>）
                  </Label>
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
                    添加 JSON 断言
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
                      placeholder="JSON 路径 (如 code 或 data.ok)"
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
                      placeholder="期望值 (如 0 或 true)"
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
                  <Label className="text-xs">单接口超时时间覆盖 (ms)</Label>
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
                    placeholder="默认继承任务设置 (10000ms)"
                    className="h-8 font-mono text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">接口备注描述</Label>
                  <Input
                    value={draft.description}
                    onChange={(e) =>
                      updateDraft((d) => {
                        d.description = e.target.value;
                        return d;
                      })
                    }
                    placeholder="记录接口业务说明或注意事项"
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
                  <span>自动跟随 30x 重定向</span>
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
                  <span>校验 HTTPS TLS 证书（自签名测试环境可关闭）</span>
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
                  <h4 className="text-xs font-semibold">
                    单次在线调试与响应检视
                  </h4>
                </div>
                <div className="flex items-center gap-2">
                  {lastTestResult && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[11px]"
                      onClick={clearTestResult}
                    >
                      清空响应
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
                    重新发送
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
                        placeholder={v.defaultValue || `输入 ${v.key} 测试值`}
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
                        断言通过
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-md bg-rose-500/15 px-2 py-0.5 font-medium text-rose-400">
                        <XCircle className="h-3.5 w-3.5" />
                        失败：{lastTestResult.failureReason ?? "请求异常"}
                      </span>
                    )}
                    <Badge variant="secondary" className="font-mono text-[11px]">
                      HTTP {lastTestResult.statusCode ?? "ERR"}{" "}
                      {lastTestResult.statusText}
                    </Badge>
                    <Badge variant="outline" className="font-mono text-[11px]">
                      耗时 {lastTestResult.latencyMs} ms
                    </Badge>
                    <Badge variant="outline" className="font-mono text-[11px]">
                      大小 {formatBytes(lastTestResult.sizeBytes)}
                    </Badge>
                  </div>

                  <div className="rounded-md bg-muted/50 px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground break-all">
                    实际请求 URL: {lastTestResult.resolvedUrl}
                  </div>

                  <pre className="max-h-60 overflow-auto rounded-lg border border-border bg-background p-3 font-mono text-xs leading-relaxed selectable">
                    {lastTestResult.responseBody || "(空响应体)"}
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
