import {
  Activity,
  Database,
  History,
  Moon,
  Plus,
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
    icon: typeof Activity;
    badge?: string | number;
    highlight?: boolean;
  }[] = [
    {
      id: "runner",
      label: "工作台",
      icon: Activity,
      badge: runningCount > 0 ? runningCount : undefined,
      highlight: runningCount > 0,
    },
    {
      id: "endpoints",
      label: "接口库",
      icon: Database,
      badge: endpoints.length > 0 ? endpoints.length : undefined,
    },
    {
      id: "history",
      label: "历史记录",
      icon: History,
      badge: tasks.length > 0 ? tasks.length : undefined,
    },
    {
      id: "settings",
      label: "设置",
      icon: Settings,
    },
  ];

  const handleQuickCreateTask = () => {
    const enabledIds = endpoints.filter((e) => e.enabled).map((e) => e.id);
    openComposer(enabledIds);
  };

  return (
    <aside className="flex h-full w-52 shrink-0 flex-col border-r border-border bg-card/75 backdrop-blur-md">
      {/* Brand Header */}
      <div className="flex items-center gap-2.5 border-b border-border/80 px-4 py-3.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 via-indigo-500 to-cyan-400 text-white shadow-sm shadow-indigo-500/20">
          <Zap className="h-4 w-4 fill-current" />
        </div>
        <span className="truncate text-sm font-bold tracking-tight">
          Pulse
        </span>
      </div>

      {/* Primary CTA */}
      <div className="px-3 pt-3 pb-1.5">
        <Button
          onClick={handleQuickCreateTask}
          className="w-full justify-center gap-1.5 shadow-sm"
          size="sm"
        >
          <Plus className="h-4 w-4" />
          新建任务
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
                "group flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-all",
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
              <span className="min-w-0 flex-1 truncate text-xs font-medium">
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
            </button>
          );
        })}
      </nav>

      {/* Bottom Footer */}
      <div className="flex items-center justify-between border-t border-border/80 px-3.5 py-2.5">
        <span className="font-mono text-[11px] text-muted-foreground">
          v{runtimeInfo?.appVersion ?? "0.1.0"}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => void toggleTheme()}
          title="切换主题"
        >
          {settings.theme === "dark" ? (
            <Sun className="h-3.5 w-3.5" />
          ) : (
            <Moon className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>
    </aside>
  );
}
