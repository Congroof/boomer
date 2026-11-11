import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  EndpointConfig,
  SingleTestRequest,
  SingleTestResponse,
} from "@/types/endpoint";
import type { TaskConfig, TaskSnapshot } from "@/types/task";
import type { AppSettings, RuntimeInfo } from "@/types/settings";
import { createEmptyEndpoint, createKeyValueItem, generateId } from "@/lib/utils";

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__);
}

// ============================================================================
// Browser Preview Fallback (only used when running `pnpm dev` outside Tauri)
// ============================================================================
const browserState = {
  endpoints: null as EndpointConfig[] | null,
  tasks: [] as TaskSnapshot[],
  timers: new Map<string, ReturnType<typeof setInterval>>(),
  listeners: new Set<(snap: TaskSnapshot) => void>(),
  settings: {
    defaultConcurrency: 16,
    defaultTimeoutMs: 10000,
    defaultUserAgent: "FluxPulse-Desktop/0.1.0",
    globalProxyUrl: "",
    maxHistoryRecords: 50,
    theme: "dark",
  } as AppSettings,
};

function getBrowserSeedEndpoints(): EndpointConfig[] {
  if (browserState.endpoints) return browserState.endpoints;
  const ep1 = createEmptyEndpoint("内置示例 (预览模式)");
  ep1.id = generateId();
  ep1.name = "用户信息查询 (GET 参数模板示例)";
  ep1.method = "GET";
  ep1.url = "https://httpbin.org/get";
  ep1.queryParams = [
    createKeyValueItem("phone", "{{phone}}", "用户手机号"),
    createKeyValueItem("channel", "{{channel}}", "渠道标识"),
    createKeyValueItem("seq", "{{$seq}}", "序号"),
  ];
  ep1.body.bodyType = "none";
  ep1.variables = [
    {
      key: "phone",
      label: "手机号",
      defaultValue: "13800138000",
      required: true,
      description: "待测试手机号",
    },
    {
      key: "channel",
      label: "业务渠道",
      defaultValue: "desktop-pc",
      required: false,
      description: "请求来源渠道",
    },
  ];

  const ep2 = createEmptyEndpoint("内置示例 (预览模式)");
  ep2.id = generateId();
  ep2.name = "消息提交通道 (POST JSON 模板示例)";
  ep2.method = "POST";
  ep2.url = "https://httpbin.org/post";

  browserState.endpoints = [ep1, ep2];
  return browserState.endpoints;
}

function notifyBrowserTaskListeners(snap: TaskSnapshot) {
  const cloned = structuredClone(snap);
  for (const cb of browserState.listeners) {
    cb(cloned);
  }
}

function startBrowserSimulatedTask(config: TaskConfig): TaskSnapshot {
  const allEps = getBrowserSeedEndpoints().filter((e) =>
    config.endpointIds.includes(e.id),
  );
  const rows =
    config.paramMode === "dataset" && config.datasetRows.length > 0
      ? config.datasetRows
      : [config.singleParams];
  const totalPlanned = Math.max(
    1,
    config.iterations * rows.length * Math.max(1, allEps.length),
  );
  const now = new Date().toISOString();
  const snap: TaskSnapshot = {
    id: generateId(),
    config,
    status: "running",
    createdAt: now,
    startedAt: now,
    finishedAt: null,
    metrics: {
      totalPlanned,
      completed: 0,
      succeeded: 0,
      failed: 0,
      retried: 0,
      inFlight: Math.min(config.concurrency, totalPlanned),
      bytesReceived: 0,
      activeElapsedMs: 0,
      currentRps: 0,
      avgRps: 0,
      peakRps: 0,
      minLatencyMs: 18,
      maxLatencyMs: 0,
      avgLatencyMs: 0,
      p50LatencyMs: 0,
      p90LatencyMs: 0,
      p95LatencyMs: 0,
      p99LatencyMs: 0,
      statusCodes: {},
      failureReasons: {},
      endpointMetrics: allEps.map((ep) => ({
        endpointId: ep.id,
        endpointName: ep.name,
        method: ep.method,
        total: 0,
        succeeded: 0,
        failed: 0,
        avgLatencyMs: 0,
        minLatencyMs: 0,
        maxLatencyMs: 0,
        p95LatencyMs: 0,
      })),
      timeline: [],
    },
    recentLogs: [],
    recentFailures: [],
  };

  browserState.tasks.unshift(snap);

  const timer = setInterval(() => {
    if (snap.status !== "running") return;
    const batch = Math.max(
      1,
      Math.min(
        Math.ceil(config.concurrency * 1.4),
        snap.metrics.totalPlanned - snap.metrics.completed,
      ),
    );
    snap.metrics.activeElapsedMs += 200;

    for (let i = 0; i < batch; i++) {
      snap.metrics.completed += 1;
      const epIdx = snap.metrics.completed % allEps.length;
      const ep = allEps[epIdx];
      const row = rows[snap.metrics.completed % rows.length] ?? {};
      const ok = Math.random() > 0.08;
      const lat = Math.round(22 + Math.random() * 85);
      snap.metrics.bytesReceived += 280;
      snap.metrics.maxLatencyMs = Math.max(snap.metrics.maxLatencyMs, lat);
      snap.metrics.avgLatencyMs = Number(
        (
          (snap.metrics.avgLatencyMs * (snap.metrics.completed - 1) + lat) /
          snap.metrics.completed
        ).toFixed(1),
      );
      snap.metrics.p50LatencyMs = Math.round(snap.metrics.avgLatencyMs * 0.92);
      snap.metrics.p90LatencyMs = Math.round(snap.metrics.avgLatencyMs * 1.32);
      snap.metrics.p95LatencyMs = Math.round(snap.metrics.avgLatencyMs * 1.48);
      snap.metrics.p99LatencyMs = Math.round(snap.metrics.avgLatencyMs * 1.75);

      const epMetric = snap.metrics.endpointMetrics[epIdx];
      if (epMetric) {
        epMetric.total += 1;
        if (ok) epMetric.succeeded += 1;
        else epMetric.failed += 1;
        epMetric.avgLatencyMs = snap.metrics.avgLatencyMs;
        epMetric.minLatencyMs = 18;
        epMetric.maxLatencyMs = snap.metrics.maxLatencyMs;
        epMetric.p95LatencyMs = snap.metrics.p95LatencyMs;
      }

      const code = ok ? "200" : "503";
      snap.metrics.statusCodes[code] = (snap.metrics.statusCodes[code] ?? 0) + 1;
      const entry = {
        seq: snap.metrics.completed,
        timestamp: new Date().toISOString().slice(11, 23),
        endpointId: ep.id,
        endpointName: ep.name,
        method: ep.method,
        resolvedUrl: ep.url,
        injectedParams: { ...config.singleParams, ...row },
        success: ok,
        statusCode: ok ? 200 : 503,
        latencyMs: lat,
        retriesUsed: 0,
        failureReason: ok ? null : "HTTP 503 (期望 200-299)",
        responsePreview: ok
          ? '{"code":0,"success":true,"message":"ok"}'
          : '{"code":5003,"success":false,"message":"upstream busy"}',
      };
      snap.recentLogs.unshift(entry);
      if (snap.recentLogs.length > 200) snap.recentLogs.pop();

      if (ok) {
        snap.metrics.succeeded += 1;
      } else {
        snap.metrics.failed += 1;
        snap.metrics.failureReasons["HTTP 503 (期望 200-299)"] =
          (snap.metrics.failureReasons["HTTP 503 (期望 200-299)"] ?? 0) + 1;
        snap.recentFailures.unshift(entry);
        if (snap.recentFailures.length > 200) snap.recentFailures.pop();
      }
    }

    const sec = Math.floor(snap.metrics.activeElapsedMs / 1000);
    const secsFloat = Math.max(0.2, snap.metrics.activeElapsedMs / 1000);
    snap.metrics.avgRps = Number(
      (snap.metrics.completed / secsFloat).toFixed(1),
    );
    snap.metrics.currentRps = batch * 5;
    snap.metrics.peakRps = Math.max(snap.metrics.peakRps, batch * 5);

    const existingPt = snap.metrics.timeline.find(
      (t) => t.secondOffset === sec,
    );
    if (existingPt) {
      existingPt.rps += batch;
      existingPt.succeeded += batch;
    } else {
      snap.metrics.timeline.push({
        secondOffset: sec,
        timestampLabel: `${sec}s`,
        rps: batch,
        succeeded: Math.round(batch * 0.92),
        failed: Math.max(0, batch - Math.round(batch * 0.92)),
        avgLatencyMs: snap.metrics.avgLatencyMs,
      });
    }

    if (snap.metrics.completed >= snap.metrics.totalPlanned) {
      snap.status = "completed";
      snap.metrics.inFlight = 0;
      snap.metrics.currentRps = 0;
      snap.finishedAt = new Date().toISOString();
      clearInterval(timer);
      browserState.timers.delete(snap.id);
    }

    notifyBrowserTaskListeners(snap);
  }, 200);

  browserState.timers.set(snap.id, timer);
  return structuredClone(snap);
}

// ============================================================================
// Unified Tauri Service API
// ============================================================================
export const tauriApi = {
  async listEndpoints(): Promise<EndpointConfig[]> {
    if (!isTauriRuntime()) return structuredClone(getBrowserSeedEndpoints());
    return invoke<EndpointConfig[]>("list_endpoints");
  },

  async upsertEndpoint(endpoint: EndpointConfig): Promise<EndpointConfig[]> {
    if (!isTauriRuntime()) {
      const list = getBrowserSeedEndpoints();
      const copy = structuredClone(endpoint);
      if (!copy.id) copy.id = generateId();
      copy.updatedAt = new Date().toISOString();
      const idx = list.findIndex((i) => i.id === copy.id);
      if (idx >= 0) list[idx] = copy;
      else list.unshift(copy);
      return structuredClone(list);
    }
    return invoke<EndpointConfig[]>("upsert_endpoint", { endpoint });
  },

  async deleteEndpoints(ids: string[]): Promise<EndpointConfig[]> {
    if (!isTauriRuntime()) {
      browserState.endpoints = getBrowserSeedEndpoints().filter(
        (e) => !ids.includes(e.id),
      );
      return structuredClone(browserState.endpoints);
    }
    return invoke<EndpointConfig[]>("delete_endpoints", { ids });
  },

  async toggleEndpoint(id: string, enabled: boolean): Promise<EndpointConfig[]> {
    if (!isTauriRuntime()) {
      const ep = getBrowserSeedEndpoints().find((e) => e.id === id);
      if (ep) ep.enabled = enabled;
      return structuredClone(getBrowserSeedEndpoints());
    }
    return invoke<EndpointConfig[]>("toggle_endpoint", { id, enabled });
  },

  async importEndpoints(
    incoming: EndpointConfig[],
    replaceAll = false,
  ): Promise<EndpointConfig[]> {
    if (!isTauriRuntime()) {
      const normalized = incoming.map((e) => ({ ...e, id: generateId() }));
      browserState.endpoints = replaceAll
        ? normalized
        : [...getBrowserSeedEndpoints(), ...normalized];
      return structuredClone(browserState.endpoints);
    }
    return invoke<EndpointConfig[]>("import_endpoints", {
      incoming,
      replaceAll,
    });
  },

  async addDemoEndpoints(): Promise<EndpointConfig[]> {
    if (!isTauriRuntime()) {
      browserState.endpoints = null;
      return structuredClone(getBrowserSeedEndpoints());
    }
    return invoke<EndpointConfig[]>("add_demo_endpoints");
  },

  async testSingleEndpoint(
    request: SingleTestRequest,
  ): Promise<SingleTestResponse> {
    if (!isTauriRuntime()) {
      return {
        success: true,
        statusCode: 200,
        statusText: "OK",
        latencyMs: 36,
        sizeBytes: 148,
        resolvedUrl: request.endpoint.url,
        resolvedHeaders: [["Accept", "application/json"]],
        resolvedBodyPreview: request.endpoint.body.rawContent,
        responseHeaders: [["content-type", "application/json"]],
        responseBody: JSON.stringify(
          {
            code: 0,
            success: true,
            note: "当前为浏览器预览模拟结果，在 Tauri 桌面端将由 Rust Reqwest 发起真实网络请求",
            injectedParams: request.params,
          },
          null,
          2,
        ),
        assertionPassed: true,
        failureReason: null,
      };
    }
    return invoke<SingleTestResponse>("test_single_endpoint", { request });
  },

  async startTask(config: TaskConfig): Promise<TaskSnapshot> {
    if (!isTauriRuntime()) {
      return startBrowserSimulatedTask(config);
    }
    return invoke<TaskSnapshot>("start_task", { config });
  },

  async pauseTask(taskId: string): Promise<TaskSnapshot> {
    if (!isTauriRuntime()) {
      const t = browserState.tasks.find((x) => x.id === taskId);
      if (!t) throw new Error("未找到任务");
      t.status = "paused";
      notifyBrowserTaskListeners(t);
      return structuredClone(t);
    }
    return invoke<TaskSnapshot>("pause_task", { taskId });
  },

  async resumeTask(taskId: string): Promise<TaskSnapshot> {
    if (!isTauriRuntime()) {
      const t = browserState.tasks.find((x) => x.id === taskId);
      if (!t) throw new Error("未找到任务");
      t.status = "running";
      notifyBrowserTaskListeners(t);
      return structuredClone(t);
    }
    return invoke<TaskSnapshot>("resume_task", { taskId });
  },

  async cancelTask(taskId: string): Promise<TaskSnapshot> {
    if (!isTauriRuntime()) {
      const t = browserState.tasks.find((x) => x.id === taskId);
      if (!t) throw new Error("未找到任务");
      t.status = "cancelled";
      t.finishedAt = new Date().toISOString();
      const timer = browserState.timers.get(taskId);
      if (timer) clearInterval(timer);
      browserState.timers.delete(taskId);
      notifyBrowserTaskListeners(t);
      return structuredClone(t);
    }
    return invoke<TaskSnapshot>("cancel_task", { taskId });
  },

  async listTasks(): Promise<TaskSnapshot[]> {
    if (!isTauriRuntime()) return structuredClone(browserState.tasks);
    return invoke<TaskSnapshot[]>("list_tasks");
  },

  async deleteTaskHistory(taskId: string): Promise<TaskSnapshot[]> {
    if (!isTauriRuntime()) {
      browserState.tasks = browserState.tasks.filter((t) => t.id !== taskId);
      return structuredClone(browserState.tasks);
    }
    return invoke<TaskSnapshot[]>("delete_task_history", { taskId });
  },

  async clearTaskHistory(): Promise<TaskSnapshot[]> {
    if (!isTauriRuntime()) {
      browserState.tasks = browserState.tasks.filter(
        (t) => t.status === "running" || t.status === "paused",
      );
      return structuredClone(browserState.tasks);
    }
    return invoke<TaskSnapshot[]>("clear_task_history");
  },

  async getSettings(): Promise<AppSettings> {
    if (!isTauriRuntime()) return structuredClone(browserState.settings);
    return invoke<AppSettings>("get_settings");
  },

  async updateSettings(settings: AppSettings): Promise<AppSettings> {
    if (!isTauriRuntime()) {
      browserState.settings = structuredClone(settings);
      return structuredClone(settings);
    }
    return invoke<AppSettings>("update_settings", { settings });
  },

  async getRuntimeInfo(): Promise<RuntimeInfo> {
    if (!isTauriRuntime()) {
      return {
        os: "browser-preview",
        arch: "wasm/web",
        cpuCores: navigator.hardwareConcurrency || 8,
        mockBaseUrl: "https://httpbin.org",
        dataDir: "(Browser Memory Preview)",
        appVersion: "0.1.0",
      };
    }
    return invoke<RuntimeInfo>("get_runtime_info");
  },

  async onTaskUpdated(
    handler: (snapshot: TaskSnapshot) => void,
  ): Promise<UnlistenFn> {
    if (!isTauriRuntime()) {
      browserState.listeners.add(handler);
      return () => {
        browserState.listeners.delete(handler);
      };
    }
    return listen<TaskSnapshot>("task-updated", (event) => {
      handler(event.payload);
    });
  },
};
