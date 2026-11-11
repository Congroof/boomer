import type { EndpointConfig } from "@/types/endpoint";
import type { TaskSnapshot } from "@/types/task";

export function downloadTextFile(
  filename: string,
  content: string,
  mimeType = "application/json;charset=utf-8",
) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportEndpointsAsJson(endpoints: EndpointConfig[]) {
  const stamp = new Date().toISOString().slice(0, 10);
  downloadTextFile(
    `fluxpulse-endpoints-${stamp}.json`,
    JSON.stringify(endpoints, null, 2),
  );
}

export function exportTaskReportAsJson(task: TaskSnapshot) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safeName = (task.config.name || task.id.slice(0, 8)).replace(
    /[\\/:*?"<>|]/g,
    "_",
  );
  downloadTextFile(
    `fluxpulse-report-${safeName}-${stamp}.json`,
    JSON.stringify(task, null, 2),
  );
}

export function exportTaskLogsAsCsv(task: TaskSnapshot) {
  const headers = [
    "序号(Seq)",
    "时间(Time)",
    "接口名称(Endpoint)",
    "方法(Method)",
    "请求URL",
    "注入参数(Params)",
    "状态(Result)",
    "HTTP状态码",
    "耗时(ms)",
    "重试次数",
    "失败原因",
  ];

  // Combine recent logs and failures (deduped by seq)
  const bySeq = new Map<number, (typeof task.recentLogs)[number]>();
  for (const item of [...task.recentLogs, ...task.recentFailures]) {
    bySeq.set(item.seq, item);
  }
  const sorted = Array.from(bySeq.values()).sort((a, b) => a.seq - b.seq);

  const escapeCsv = (val: string | number | null | undefined) => {
    const s = String(val ?? "");
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const lines = [
    headers.join(","),
    ...sorted.map((row) =>
      [
        row.seq,
        row.timestamp,
        row.endpointName,
        row.method,
        row.resolvedUrl,
        JSON.stringify(row.injectedParams),
        row.success ? "SUCCESS" : "FAILED",
        row.statusCode ?? "ERR",
        row.latencyMs,
        row.retriesUsed,
        row.failureReason ?? "",
      ]
        .map(escapeCsv)
        .join(","),
    ),
  ];

  // Prepend UTF-8 BOM so Excel on Windows opens Chinese characters properly
  const csvWithBom = `\uFEFF${lines.join("\r\n")}`;
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  downloadTextFile(
    `fluxpulse-logs-${stamp}.csv`,
    csvWithBom,
    "text/csv;charset=utf-8",
  );
}
