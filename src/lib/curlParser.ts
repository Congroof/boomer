import type { EndpointConfig, HttpMethod, KeyValueItem } from "@/types/endpoint";
import { createEmptyEndpoint, createKeyValueItem } from "@/lib/utils";
import { syncEndpointVariables } from "@/lib/templateVars";

const VALID_METHODS = new Set<HttpMethod>([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
]);

/**
 * Tokenizes shell-style cURL command strings (supporting single/double quotes and line continuations).
 */
export function tokenizeShellCommand(cmd: string): string[] {
  const normalized = cmd.replace(/\\\r?\n/g, " ").trim();
  const tokens: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  let i = 0;

  while (i < normalized.length) {
    const ch = normalized[i];

    if (quote === "'") {
      if (ch === "'") {
        quote = null;
      } else {
        current += ch;
      }
      i += 1;
      continue;
    }

    if (quote === '"') {
      if (ch === "\\" && i + 1 < normalized.length) {
        current += normalized[i + 1];
        i += 2;
        continue;
      }
      if (ch === '"') {
        quote = null;
      } else {
        current += ch;
      }
      i += 1;
      continue;
    }

    // Unquoted context
    if (ch === "'" || ch === '"') {
      quote = ch;
      i += 1;
      continue;
    }

    if (ch === "\\" && i + 1 < normalized.length) {
      current += normalized[i + 1];
      i += 2;
      continue;
    }

    if (/\s/.test(ch)) {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
      i += 1;
      continue;
    }

    current += ch;
    i += 1;
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return tokens;
}

/**
 * Parses a standard cURL command into an `EndpointConfig`.
 */
export function parseCurlToEndpoint(
  curlInput: string,
  group = "cURL 导入",
): EndpointConfig {
  const tokens = tokenizeShellCommand(curlInput);
  if (tokens.length === 0) {
    throw new Error("请输入有效的 cURL 命令");
  }

  let idx = 0;
  if (tokens[0].toLowerCase() === "curl") {
    idx = 1;
  }

  let explicitMethod: HttpMethod | null = null;
  let rawUrl = "";
  const headers: KeyValueItem[] = [];
  const dataChunks: string[] = [];
  let verifySsl = true;
  let followRedirects = true;

  while (idx < tokens.length) {
    const tok = tokens[idx];

    if ((tok === "-X" || tok === "--request") && idx + 1 < tokens.length) {
      const m = tokens[idx + 1].toUpperCase() as HttpMethod;
      if (VALID_METHODS.has(m)) {
        explicitMethod = m;
      }
      idx += 2;
      continue;
    }

    if ((tok === "-H" || tok === "--header") && idx + 1 < tokens.length) {
      const rawHeader = tokens[idx + 1];
      const colonIdx = rawHeader.indexOf(":");
      if (colonIdx > 0) {
        const k = rawHeader.slice(0, colonIdx).trim();
        const v = rawHeader.slice(colonIdx + 1).trim();
        headers.push(createKeyValueItem(k, v));
      }
      idx += 2;
      continue;
    }

    if ((tok === "-b" || tok === "--cookie") && idx + 1 < tokens.length) {
      headers.push(createKeyValueItem("Cookie", tokens[idx + 1]));
      idx += 2;
      continue;
    }

    if (
      (tok === "-d" ||
        tok === "--data" ||
        tok === "--data-raw" ||
        tok === "--data-binary" ||
        tok === "--data-urlencode") &&
      idx + 1 < tokens.length
    ) {
      dataChunks.push(tokens[idx + 1]);
      idx += 2;
      continue;
    }

    if (tok === "--url" && idx + 1 < tokens.length) {
      rawUrl = tokens[idx + 1];
      idx += 2;
      continue;
    }

    if (tok === "-k" || tok === "--insecure") {
      verifySsl = false;
      idx += 1;
      continue;
    }

    if (tok === "-L" || tok === "--location") {
      followRedirects = true;
      idx += 1;
      continue;
    }

    if (!tok.startsWith("-") && !rawUrl && /^https?:\/\//i.test(tok)) {
      rawUrl = tok;
      idx += 1;
      continue;
    }

    idx += 1;
  }

  if (!rawUrl) {
    // Fallback: look for any token looking like domain/url
    const candidate = tokens.find(
      (t, i) => i > 0 && !t.startsWith("-") && t.includes("."),
    );
    if (candidate) {
      rawUrl = candidate.startsWith("http") ? candidate : `https://${candidate}`;
    } else {
      throw new Error("未能从 cURL 命令中识别出目标 URL");
    }
  }

  const endpoint = createEmptyEndpoint(group);
  endpoint.headers = headers;
  endpoint.verifySsl = verifySsl;
  endpoint.followRedirects = followRedirects;

  // Extract query parameters cleanly while preserving `{{...}}` placeholders
  let baseUrl = rawUrl;
  const qIndex = rawUrl.indexOf("?");
  const queryParams: KeyValueItem[] = [];
  if (qIndex !== -1) {
    baseUrl = rawUrl.slice(0, qIndex);
    const queryStr = rawUrl.slice(qIndex + 1);
    for (const pair of queryStr.split("&")) {
      if (!pair) continue;
      const eqIdx = pair.indexOf("=");
      if (eqIdx === -1) {
        queryParams.push(createKeyValueItem(decodeSafe(pair), ""));
      } else {
        queryParams.push(
          createKeyValueItem(
            decodeSafe(pair.slice(0, eqIdx)),
            decodeSafe(pair.slice(eqIdx + 1)),
          ),
        );
      }
    }
  }
  endpoint.url = baseUrl;
  endpoint.queryParams = queryParams;

  const contentTypeHeader = headers.find(
    (h) => h.key.toLowerCase() === "content-type",
  )?.value;

  if (dataChunks.length > 0) {
    const joinedBody = dataChunks.join("&");
    endpoint.method = explicitMethod ?? "POST";
    const trimmed = joinedBody.trim();

    const looksLikeJson =
      (contentTypeHeader && contentTypeHeader.includes("json")) ||
      (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]"));

    if (looksLikeJson) {
      endpoint.body = {
        bodyType: "json",
        rawContent: prettyJsonOrRaw(trimmed),
        rawContentType: "application/json",
        formItems: [],
      };
    } else if (
      !contentTypeHeader ||
      contentTypeHeader.includes("x-www-form-urlencoded")
    ) {
      const formItems: KeyValueItem[] = joinedBody
        .split("&")
        .filter(Boolean)
        .map((pair) => {
          const eq = pair.indexOf("=");
          if (eq === -1) return createKeyValueItem(decodeSafe(pair), "");
          return createKeyValueItem(
            decodeSafe(pair.slice(0, eq)),
            decodeSafe(pair.slice(eq + 1)),
          );
        });
      endpoint.body = {
        bodyType: "formUrlencoded",
        rawContent: "",
        rawContentType: "text/plain; charset=utf-8",
        formItems,
      };
    } else {
      endpoint.body = {
        bodyType: "raw",
        rawContent: joinedBody,
        rawContentType: contentTypeHeader,
        formItems: [],
      };
    }
  } else {
    endpoint.method = explicitMethod ?? "GET";
    endpoint.body = {
      bodyType: "none",
      rawContent: "",
      rawContentType: "text/plain; charset=utf-8",
      formItems: [],
    };
  }

  // Generate readable name from URL pathname
  try {
    const u = new URL(baseUrl);
    endpoint.name = `${endpoint.method} ${u.pathname === "/" ? u.hostname : u.pathname}`;
  } catch {
    endpoint.name = `${endpoint.method} 导入接口`;
  }

  endpoint.variables = syncEndpointVariables(endpoint);
  return endpoint;
}

function decodeSafe(s: string): string {
  try {
    return decodeURIComponent(s.replace(/\+/g, " "));
  } catch {
    return s;
  }
}

function prettyJsonOrRaw(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}
