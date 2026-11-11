import { useState } from "react";
import { Terminal } from "lucide-react";
import { toast } from "sonner";
import { parseCurlToEndpoint } from "@/lib/curlParser";
import { useEndpointStore } from "@/stores/useEndpointStore";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

interface CurlImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SAMPLE_CURL = `curl -X POST 'https://httpbin.org/post?source=web' \\
  -H 'Content-Type: application/json' \\
  -H 'X-Request-Id: {{$uuid}}' \\
  --data-raw '{"userId": "{{userId}}", "timestamp": {{$timestamp}}}'`;

export function CurlImportDialog({
  open,
  onOpenChange,
}: CurlImportDialogProps) {
  const [curlText, setCurlText] = useState("");
  const upsertFromCurl = useEndpointStore((s) => s.importEndpoints);

  const handleParseAndImport = async () => {
    try {
      const parsed = parseCurlToEndpoint(curlText);
      await upsertFromCurl([parsed], false);
      toast.success(`已导入接口：${parsed.name}`);
      setCurlText("");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-primary" />
            导入 cURL
          </DialogTitle>
          <DialogDescription>
            粘贴 cURL 命令，自动提取请求方法、Query、Headers 与 Body。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              命令内容
            </span>
            <button
              type="button"
              onClick={() => setCurlText(SAMPLE_CURL)}
              className="text-xs text-primary hover:underline"
            >
              填入示例
            </button>
          </div>
          <Textarea
            value={curlText}
            onChange={(e) => setCurlText(e.target.value)}
            placeholder="curl -X POST 'https://api.example.com/v1/items' -H 'Content-Type: application/json' -d '{...}'"
            className="min-h-[180px] font-mono text-xs leading-relaxed"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            onClick={() => void handleParseAndImport()}
            disabled={!curlText.trim()}
          >
            解析并导入
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
