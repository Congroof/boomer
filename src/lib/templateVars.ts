import type { EndpointConfig, VariableDefinition } from "@/types/endpoint";

export interface BuiltinTokenInfo {
  token: string;
  label: string;
  example: string;
}

export const BUILTIN_TEMPLATE_TOKENS: BuiltinTokenInfo[] = [
  {
    token: "{{$uuid}}",
    label: "随机 UUID v4",
    example: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  },
  {
    token: "{{$timestamp}}",
    label: "秒级时间戳",
    example: "1762839335",
  },
  {
    token: "{{$timestamp_ms}}",
    label: "毫秒级时间戳",
    example: "1762839335128",
  },
  {
    token: "{{$seq}}",
    label: "任务内递增序号",
    example: "1, 2, 3...",
  },
  {
    token: "{{$random_int:1000:9999}}",
    label: "区间随机整数",
    example: "5839",
  },
  {
    token: "{{$random_str:8}}",
    label: "随机字符串",
    example: "a9Kp2Qx7",
  },
];

const PLACEHOLDER_RE = /\{\{\s*([^{}]+?)\s*\}\}/g;

const COMMON_VARIABLE_LABELS: Record<string, string> = {
  phone: "手机号",
  mobile: "手机号",
  tel: "电话号码",
  email: "电子邮箱",
  token: "鉴权 Token",
  userId: "用户 ID",
  user_id: "用户 ID",
  account: "账号",
  code: "验证码 / 编码",
  channel: "业务渠道",
};

/**
 * Extracts custom `{{variable}}` names from any string, ignoring built-in `{{$...}}` tokens.
 */
export function extractCustomVarsFromText(text: string): string[] {
  if (!text || !text.includes("{{")) return [];
  const found: string[] = [];
  const seen = new Set<string>();

  for (const match of text.matchAll(PLACEHOLDER_RE)) {
    const token = match[1]?.trim();
    if (!token || token.startsWith("$")) continue;
    if (!seen.has(token)) {
      seen.add(token);
      found.push(token);
    }
  }
  return found;
}

/**
 * Scans URL, Query Params, Headers, and Body of an endpoint to find all custom `{{var}}` keys.
 */
export function detectEndpointCustomVars(
  endpoint: Pick<EndpointConfig, "url" | "queryParams" | "headers" | "body">,
): string[] {
  const buckets: string[] = [endpoint.url];

  for (const q of endpoint.queryParams) {
    if (q.enabled) {
      buckets.push(q.key, q.value);
    }
  }
  for (const h of endpoint.headers) {
    if (h.enabled) {
      buckets.push(h.key, h.value);
    }
  }
  if (endpoint.body.bodyType === "json" || endpoint.body.bodyType === "raw") {
    buckets.push(endpoint.body.rawContent);
  } else if (
    endpoint.body.bodyType === "formUrlencoded" ||
    endpoint.body.bodyType === "multipart"
  ) {
    for (const f of endpoint.body.formItems) {
      if (f.enabled) {
        buckets.push(f.key, f.value);
      }
    }
  }

  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const segment of buckets) {
    for (const v of extractCustomVarsFromText(segment)) {
      if (!seen.has(v)) {
        seen.add(v);
        ordered.push(v);
      }
    }
  }
  return ordered;
}

/**
 * Synchronizes `endpoint.variables` with detected `{{var}}` placeholders,
 * preserving user-configured labels, defaults, and descriptions.
 */
export function syncEndpointVariables(
  endpoint: EndpointConfig,
): VariableDefinition[] {
  const detectedKeys = detectEndpointCustomVars(endpoint);
  const existingMap = new Map<string, VariableDefinition>();
  for (const v of endpoint.variables) {
    existingMap.set(v.key, v);
  }

  const merged: VariableDefinition[] = [];
  const added = new Set<string>();

  for (const key of detectedKeys) {
    const existing = existingMap.get(key);
    if (existing) {
      merged.push(existing);
    } else {
      merged.push({
        key,
        label: COMMON_VARIABLE_LABELS[key] ?? key,
        defaultValue: "",
        required: true,
        description: "",
      });
    }
    added.add(key);
  }

  // Keep manually declared variables even if temporarily removed from template text
  for (const v of endpoint.variables) {
    if (!added.has(v.key) && v.key.trim()) {
      merged.push(v);
    }
  }

  return merged;
}

/**
 * Aggregates custom variable definitions across multiple endpoints for task parameter injection.
 */
export function aggregateTaskVariables(
  endpoints: EndpointConfig[],
): VariableDefinition[] {
  const map = new Map<string, VariableDefinition>();

  for (const ep of endpoints) {
    const synced = syncEndpointVariables(ep);
    for (const v of synced) {
      const prev = map.get(v.key);
      if (!prev) {
        map.set(v.key, { ...v });
      } else {
        map.set(v.key, {
          key: v.key,
          label: prev.label || v.label,
          defaultValue: prev.defaultValue || v.defaultValue,
          required: prev.required || v.required,
          description: prev.description || v.description,
        });
      }
    }
  }

  return Array.from(map.values());
}
