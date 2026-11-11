import type { TaskMetrics } from "@/types/task";
import { formatNumber } from "@/lib/utils";

interface TaskChartsProps {
  metrics: TaskMetrics;
}

export function TaskCharts({ metrics }: TaskChartsProps) {
  const points = metrics.timeline.slice(-40);
  const maxRps = Math.max(
    1,
    ...points.map((p) => p.rps),
    metrics.peakRps || 1,
  );

  const statusEntries = Object.entries(metrics.statusCodes).sort(
    (a, b) => b[1] - a[1],
  );
  const failureEntries = Object.entries(metrics.failureReasons).sort(
    (a, b) => b[1] - a[1],
  );

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {/* Throughput & Success/Failure Stacked Bars */}
      <div className="col-span-2 rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h4 className="text-xs font-semibold">吞吐趋势 (RPS)</h4>
          <div className="flex items-center gap-3 text-[11px]">
            <span className="flex items-center gap-1 text-emerald-400">
              <span className="h-2 w-2 rounded-sm bg-emerald-500" />
              成功
            </span>
            <span className="flex items-center gap-1 text-rose-400">
              <span className="h-2 w-2 rounded-sm bg-rose-500" />
              失败
            </span>
            <span className="font-mono text-muted-foreground">
              峰值 {formatNumber(metrics.peakRps)}/s
            </span>
          </div>
        </div>

        {points.length === 0 ? (
          <div className="flex h-36 items-center justify-center rounded-lg border border-dashed border-border/60 text-xs text-muted-foreground">
            等待采样数据...
          </div>
        ) : (
          <div className="relative h-36 w-full pt-2">
            <svg
              viewBox={`0 0 ${Math.max(points.length * 16, 320)} 120`}
              preserveAspectRatio="none"
              className="h-28 w-full overflow-visible"
            >
              {[0.25, 0.5, 0.75, 1].map((ratio) => (
                <line
                  key={ratio}
                  x1={0}
                  x2={Math.max(points.length * 16, 320)}
                  y1={120 - ratio * 110}
                  y2={120 - ratio * 110}
                  stroke="currentColor"
                  className="text-border/60"
                  strokeDasharray="3 3"
                  strokeWidth={1}
                />
              ))}

              {points.map((pt, idx) => {
                const slotWidth =
                  Math.max(points.length * 16, 320) /
                  Math.max(points.length, 20);
                const barWidth = Math.max(4, slotWidth * 0.68);
                const x = idx * slotWidth + (slotWidth - barWidth) / 2;
                const okH = (pt.succeeded / maxRps) * 110;
                const failH = (pt.failed / maxRps) * 110;
                const okY = 120 - okH;
                const failY = okY - failH;

                return (
                  <g key={pt.secondOffset}>
                    <title>
                      {`${pt.timestampLabel}: ${pt.rps}/s (成功 ${pt.succeeded}, 失败 ${pt.failed}, 均耗时 ${pt.avgLatencyMs}ms)`}
                    </title>
                    {okH > 0 && (
                      <rect
                        x={x}
                        y={okY}
                        width={barWidth}
                        height={Math.max(1.5, okH)}
                        rx={2}
                        className="fill-emerald-500/85"
                      />
                    )}
                    {failH > 0 && (
                      <rect
                        x={x}
                        y={failY}
                        width={barWidth}
                        height={Math.max(1.5, failH)}
                        rx={2}
                        className="fill-rose-500/90"
                      />
                    )}
                  </g>
                );
              })}
            </svg>
            <div className="mt-1 flex justify-between font-mono text-[10px] text-muted-foreground">
              <span>{points[0]?.timestampLabel ?? "0s"}</span>
              <span>{points[points.length - 1]?.timestampLabel ?? ""}</span>
            </div>
          </div>
        )}
      </div>

      {/* Latency Percentiles + Status Codes & Failure Reasons */}
      <div className="space-y-3 rounded-xl border border-border bg-card p-4">
        <h4 className="text-xs font-semibold">耗时分位与状态码</h4>

        <div className="grid grid-cols-4 gap-1.5 text-center">
          {[
            ["P50", metrics.p50LatencyMs],
            ["P90", metrics.p90LatencyMs],
            ["P95", metrics.p95LatencyMs],
            ["P99", metrics.p99LatencyMs],
          ].map(([label, val]) => (
            <div
              key={label}
              className="rounded-lg border border-border/60 bg-muted/35 px-2 py-1.5"
            >
              <div className="text-[10px] text-muted-foreground">{label}</div>
              <div className="font-mono text-xs font-semibold">{val}ms</div>
            </div>
          ))}
        </div>

        {/* Status Codes */}
        <div className="space-y-1.5 pt-1">
          <div className="text-[11px] text-muted-foreground">状态码分布</div>
          {statusEntries.length === 0 ? (
            <p className="text-[11px] text-muted-foreground/70">暂无记录</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {statusEntries.map(([code, count]) => {
                const is2xx = code.startsWith("2");
                return (
                  <span
                    key={code}
                    className={`rounded-md border px-2 py-0.5 font-mono text-[11px] font-medium ${
                      is2xx
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                        : "border-rose-500/30 bg-rose-500/10 text-rose-400"
                    }`}
                  >
                    {code}: {formatNumber(count)}
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {/* Top Failure Reasons */}
        {failureEntries.length > 0 && (
          <div className="space-y-1 pt-1">
            <div className="text-[11px] text-rose-400">失败原因</div>
            <div className="space-y-1 max-h-20 overflow-y-auto">
              {failureEntries.slice(0, 4).map(([reason, cnt]) => (
                <div
                  key={reason}
                  className="flex items-center justify-between gap-2 rounded bg-rose-500/8 px-2 py-1 text-[11px]"
                >
                  <span className="truncate text-rose-300" title={reason}>
                    {reason}
                  </span>
                  <span className="shrink-0 font-mono font-semibold text-rose-400">
                    {formatNumber(cnt)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
