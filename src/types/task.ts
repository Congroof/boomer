export type ParamInjectionMode = "single" | "dataset";

export type TaskStatus =
  | "running"
  | "paused"
  | "completed"
  | "cancelled"
  | "failed";

export interface TaskConfig {
  name: string;
  endpointIds: string[];
  paramMode: ParamInjectionMode;
  singleParams: Record<string, string>;
  datasetRows: Record<string, string>[];
  concurrency: number;
  iterations: number;
  intervalMs: number;
  maxRps: number | null;
  timeoutMs: number;
  retryCount: number;
  proxyUrl: string | null;
  stopOnFailCount: number | null;
}

export interface EndpointMetric {
  endpointId: string;
  endpointName: string;
  method: string;
  total: number;
  succeeded: number;
  failed: number;
  avgLatencyMs: number;
  minLatencyMs: number;
  maxLatencyMs: number;
  p95LatencyMs: number;
}

export interface TimeSeriesPoint {
  secondOffset: number;
  timestampLabel: string;
  rps: number;
  succeeded: number;
  failed: number;
  avgLatencyMs: number;
}

export interface RequestLogEntry {
  seq: number;
  timestamp: string;
  endpointId: string;
  endpointName: string;
  method: string;
  resolvedUrl: string;
  injectedParams: Record<string, string>;
  success: boolean;
  statusCode: number | null;
  latencyMs: number;
  retriesUsed: number;
  failureReason: string | null;
  responsePreview: string;
}

export interface TaskMetrics {
  totalPlanned: number;
  completed: number;
  succeeded: number;
  failed: number;
  retried: number;
  inFlight: number;
  bytesReceived: number;
  activeElapsedMs: number;
  currentRps: number;
  avgRps: number;
  peakRps: number;
  minLatencyMs: number;
  maxLatencyMs: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p90LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  statusCodes: Record<string, number>;
  failureReasons: Record<string, number>;
  endpointMetrics: EndpointMetric[];
  timeline: TimeSeriesPoint[];
}

export interface TaskSnapshot {
  id: string;
  config: TaskConfig;
  status: TaskStatus;
  createdAt: string;
  startedAt: string;
  finishedAt: string | null;
  metrics: TaskMetrics;
  recentLogs: RequestLogEntry[];
  recentFailures: RequestLogEntry[];
}
