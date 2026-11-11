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

const SAMPLE_CURL = `curl -X POST 'https://httpbin.org/post?channel=pc_client' \\
  -H 'Content-Type: application/json' \\
  -H 'X-Request-Id: {{$uuid}}' \\
  --data-raw '{"phone": "{{phone}}", "timestamp": {{$timestamp}}}'`;

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
      toast.success(`已成功解析并录入接口：${parsed.name}`);
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
            从 cURL 命令快速录入接口
          </DialogTitle>
          <DialogDescription>
            支持直接粘贴浏览器 DevTools（Copy as cURL）或接口文档中的命令，系统将自动提取请求方法、Query、Headers、Body 及{" "}
            <code className="rounded bg-muted px-1 font-mono text-primary">
              {"{{变量}}"}
            </code>
            。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              cURL 命令内容
            </span>
            <button
              type="button"
              onClick={() => setCurlText(SAMPLE_CURL)}
              className="text-xs text-primary hover:underline"
            >
              填入示例 cURL
            </button>
          </div>
          <Textarea
            value={curlText}
            onChange={(e) => setCurlText(e.target.value)}
            placeholder="curl -X POST 'https://api.example.com/v1/send' -H 'Content-Type: application/json' -d '{...}'"
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
            解析并保存接口
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
