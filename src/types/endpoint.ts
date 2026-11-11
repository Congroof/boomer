export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS";

export type BodyType =
  | "none"
  | "json"
  | "formUrlencoded"
  | "multipart"
  | "raw";

export interface KeyValueItem {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
  description: string;
}

export interface RequestBodyConfig {
  bodyType: BodyType;
  rawContent: string;
  rawContentType: string;
  formItems: KeyValueItem[];
}

export interface VariableDefinition {
  key: string;
  label: string;
  defaultValue: string;
  required: boolean;
  description: string;
}

export interface JsonFieldAssertion {
  path: string;
  expected: string;
}

export interface AssertionConfig {
  statusCodes: string;
  bodyContains: string;
  bodyNotContains: string;
  jsonAssertions: JsonFieldAssertion[];
  maxLatencyMs: number | null;
}

export interface EndpointConfig {
  id: string;
  name: string;
  group: string;
  tags: string[];
  enabled: boolean;
  description: string;
  method: HttpMethod;
  url: string;
  queryParams: KeyValueItem[];
  headers: KeyValueItem[];
  body: RequestBodyConfig;
  variables: VariableDefinition[];
  assertions: AssertionConfig;
  timeoutMs: number | null;
  followRedirects: boolean;
  verifySsl: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SingleTestRequest {
  endpoint: EndpointConfig;
  params: Record<string, string>;
}

export interface SingleTestResponse {
  success: boolean;
  statusCode: number | null;
  statusText: string;
  latencyMs: number;
  sizeBytes: number;
  resolvedUrl: string;
  resolvedHeaders: [string, string][];
  resolvedBodyPreview: string;
  responseHeaders: [string, string][];
  responseBody: string;
  assertionPassed: boolean;
  failureReason: string | null;
}
