import {
  Activity,
  Database,
  History,
  Moon,
  PlusCircle,
  Settings,
  Sun,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore, type ActiveNavTab } from "@/stores/useAppStore";
import { useEndpointStore } from "@/stores/useEndpointStore";
import { useTaskStore } from "@/stores/useTaskStore";
import { Button } from "@/components/ui/button";

export function AppSidebar() {
  const { activeTab, setActiveTab, settings, toggleTheme, runtimeInfo } =
    useAppStore();
  const endpoints = useEndpointStore((s) => s.endpoints);
  const tasks = useTaskStore((s) => s.tasks);
  const openComposer = useTaskStore((s) => s.openComposer);

  const runningCount = tasks.filter(
    (t) => t.status === "running" || t.status === "paused",
  ).length;

  const navItems: {
    id: ActiveNavTab;
    label: string;
    sublabel: string;
    icon: typeof Activity;
    badge?: string | number;
    highlight?: boolean;
  }[] = [
    {
      id: "runner",
      label: "并发工作台",
      sublabel: "任务调度与实时监控",
      icon: Activity,
      badge: runningCount > 0 ? `${runningCount} 运行中` : undefined,
      highlight: runningCount > 0,
    },
    {
      id: "endpoints",
      label: "接口管理库",
      sublabel: "录入模板与断言配置",
      icon: Database,
      badge: endpoints.length,
    },
    {
      id: "history",
      label: "统计与归档",
      sublabel: "执行报告与结果检索",
      icon: History,
      badge: tasks.length > 0 ? tasks.length : undefined,
    },
    {
      id: "settings",
      label: "引擎设置",
      sublabel: "代理、超时与并发默认值",
      icon: Settings,
    },
  ];

  const handleQuickCreateTask = () => {
    const enabledIds = endpoints.filter((e) => e.enabled).map((e) => e.id);
    openComposer(enabledIds);
  };

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-border bg-card/75 backdrop-blur-md">
      {/* Brand Header */}
      <div className="flex items-center gap-3 border-b border-border/80 px-4 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 via-indigo-500 to-cyan-400 text-white shadow-md shadow-indigo-500/20">
          <Zap className="h-5 w-5 fill-current" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-bold tracking-tight">
              FluxPulse
            </span>
            <span className="rounded bg-primary/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-primary">
              Tokio
            </span>
          </div>
          <p className="truncate text-[11px] text-muted-foreground">
            高性能接口并发客户端
          </p>
        </div>
      </div>

      {/* Primary CTA */}
      <div className="px-3 pt-3.5 pb-2">
        <Button
          onClick={handleQuickCreateTask}
          className="w-full justify-center gap-2 shadow-sm"
          size="sm"
        >
          <PlusCircle className="h-4 w-4" />
          新建并发任务
        </Button>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 space-y-1 px-2.5 py-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={cn(
                "group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all",
                active
                  ? "bg-primary/12 text-foreground ring-1 ring-primary/25"
                  : "text-muted-foreground hover:bg-accent/70 hover:text-foreground",
              )}
            >
              <Icon
                className={cn(
                  "h-4 w-4 shrink-0 transition-colors",
                  active
                    ? "text-primary"
                    : "text-muted-foreground group-hover:text-foreground",
                )}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="truncate text-xs font-semibold">
                    {item.label}
                  </span>
                  {item.badge !== undefined && (
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-0.5 font-mono text-[10px] font-medium",
                        item.highlight
                          ? "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {item.badge}
                    </span>
                  )}
                </div>
                <p className="truncate text-[10px] text-muted-foreground/80">
                  {item.sublabel}
                </p>
              </div>
            </button>
          );
        })}
      </nav>

      {/* Bottom Runtime Status & Theme Switch */}
      <div className="border-t border-border/80 p-3 space-y-2.5">
        {runtimeInfo && (
          <div className="rounded-lg border border-border/60 bg-muted/40 px-2.5 py-2 text-[11px]">
            <div className="flex items-center justify-between text-muted-foreground">
              <span>运行环境</span>
              <span className="font-mono text-foreground">
                {runtimeInfo.os} · {runtimeInfo.cpuCores} 核
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between text-muted-foreground">
              <span>异步引擎</span>
              <span className="flex items-center gap-1 font-mono text-emerald-500">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Rust + Reqwest
              </span>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between px-1">
          <span className="text-[11px] text-muted-foreground">
            v{runtimeInfo?.appVersion ?? "0.1.0"} · 纯本地存储
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => void toggleTheme()}
            title="切换深色/浅色主题"
          >
            {settings.theme === "dark" ? (
              <Sun className="h-3.5 w-3.5" />
            ) : (
              <Moon className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>
    </aside>
  );
}
