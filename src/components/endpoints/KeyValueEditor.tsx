import { Plus, Trash2 } from "lucide-react";
import type { KeyValueItem } from "@/types/endpoint";
import { createKeyValueItem } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

interface KeyValueEditorProps {
  items: KeyValueItem[];
  onChange: (next: KeyValueItem[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  descPlaceholder?: string;
  presets?: { label: string; key: string; value: string }[];
}

export function KeyValueEditor({
  items,
  onChange,
  keyPlaceholder = "参数名",
  valuePlaceholder = "参数值（支持 {{变量}}）",
  descPlaceholder = "备注（可选）",
  presets,
}: KeyValueEditorProps) {
  const handleUpdate = (
    id: string,
    patch: Partial<Omit<KeyValueItem, "id">>,
  ) => {
    onChange(items.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const handleRemove = (id: string) => {
    onChange(items.filter((row) => row.id !== id));
  };

  const handleAdd = (key = "", value = "") => {
    onChange([...items, createKeyValueItem(key, value)]);
  };

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {presets?.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => handleAdd(p.key, p.value)}
              className="rounded-md border border-border bg-muted/50 px-2 py-1 text-[11px] text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
            >
              + {p.label}
            </button>
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={() => handleAdd()}
        >
          <Plus className="h-3.5 w-3.5" />
          添加字段
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/70 py-6 text-center text-xs text-muted-foreground">
          暂无字段，点击右上角「添加字段」新增
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <div className="grid grid-cols-[44px_1fr_1.4fr_1fr_40px] items-center gap-2 border-b border-border bg-muted/40 px-3 py-1.5 text-[11px] font-medium text-muted-foreground">
            <span>启用</span>
            <span>名称</span>
            <span>值</span>
            <span>备注</span>
            <span />
          </div>
          <div className="divide-y divide-border/60">
            {items.map((item) => (
              <div
                key={item.id}
                className="grid grid-cols-[44px_1fr_1.4fr_1fr_40px] items-center gap-2 px-3 py-1.5"
              >
                <div className="flex items-center">
                  <Switch
                    checked={item.enabled}
                    onCheckedChange={(checked) =>
                      handleUpdate(item.id, { enabled: checked })
                    }
                  />
                </div>
                <Input
                  value={item.key}
                  onChange={(e) =>
                    handleUpdate(item.id, { key: e.target.value })
                  }
                  placeholder={keyPlaceholder}
                  className="h-8 font-mono text-xs"
                />
                <Input
                  value={item.value}
                  onChange={(e) =>
                    handleUpdate(item.id, { value: e.target.value })
                  }
                  placeholder={valuePlaceholder}
                  className="h-8 font-mono text-xs"
                />
                <Input
                  value={item.description}
                  onChange={(e) =>
                    handleUpdate(item.id, { description: e.target.value })
                  }
                  placeholder={descPlaceholder}
                  className="h-8 text-xs"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => handleRemove(item.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
