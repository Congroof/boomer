import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type {
  EndpointConfig,
  HttpMethod,
  KeyValueItem,
} from "@/types/endpoint";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function generateId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createKeyValueItem(
  key = "",
  value = "",
  description = "",
): KeyValueItem {
  return {
    id: generateId(),
    key,
    value,
    enabled: true,
    description,
  };
}

export function createEmptyEndpoint(group = "默认分组"): EndpointConfig {
  const now = new Date().toISOString();
  return {
    id: "",
    name: "新建 HTTP 接口",
    group,
    tags: [],
    enabled: true,
    description: "",
    method: "POST",
    url: "https://httpbin.org/post",
    queryParams: [],
    headers: [
      createKeyValueItem("Accept", "application/json", "默认接收 JSON 响应"),
    ],
    body: {
      bodyType: "json",
      rawContent: '{\n  "phone": "{{phone}}",\n  "traceId": "{{$uuid}}"\n}',
      rawContentType: "text/plain; charset=utf-8",
      formItems: [],
    },
    variables: [
      {
        key: "phone",
        label: "手机号",
        defaultValue: "13800138000",
        required: true,
        description: "自定义注入参数",
      },
    ],
    assertions: {
      statusCodes: "200-299",
      bodyContains: "",
      bodyNotContains: "",
      jsonAssertions: [],
      maxLatencyMs: null,
    },
    timeoutMs: 10000,
    followRedirects: true,
    verifySsl: true,
    createdAt: now,
    updatedAt: now,
  };
}

export function getMethodColorClass(method: HttpMethod | string): string {
  switch (method.toUpperCase()) {
    case "GET":
      return "bg-emerald-500/15 text-emerald-500 border-emerald-500/30";
    case "POST":
      return "bg-sky-500/15 text-sky-400 border-sky-500/30";
    case "PUT":
      return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    case "PATCH":
      return "bg-violet-500/15 text-violet-400 border-violet-500/30";
    case "DELETE":
      return "bg-rose-500/15 text-rose-400 border-rose-500/30";
    default:
      return "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
  }
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat("zh-CN").format(n);
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let idx = 0;
  let val = bytes;
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024;
    idx += 1;
  }
  return `${val.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
}

export function formatDurationMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const sec = ms / 1000;
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const mins = Math.floor(sec / 60);
  const rem = Math.round(sec % 60);
  return `${mins}m ${rem}s`;
}
