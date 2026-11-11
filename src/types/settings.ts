export interface AppSettings {
  defaultConcurrency: number;
  defaultTimeoutMs: number;
  defaultUserAgent: string;
  globalProxyUrl: string;
  maxHistoryRecords: number;
  theme: "dark" | "light" | "system";
}

export interface RuntimeInfo {
  os: string;
  arch: string;
  cpuCores: number;
  mockBaseUrl: string;
  dataDir: string;
  appVersion: string;
}
