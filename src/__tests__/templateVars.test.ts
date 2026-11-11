import { describe, expect, it } from "vitest";
import {
  detectEndpointCustomVars,
  extractCustomVarsFromText,
  syncEndpointVariables,
} from "@/lib/templateVars";
import { createEmptyEndpoint, createKeyValueItem } from "@/lib/utils";

describe("templateVars", () => {
  it("extracts custom variables while ignoring built-in $ tokens", () => {
    const vars = extractCustomVarsFromText(
      "https://example.com/api?phone={{phone}}&uid={{ userId }}&trace={{$uuid}}&ts={{$timestamp}}",
    );
    expect(vars).toEqual(["phone", "userId"]);
  });

  it("detects variables across URL, headers, query, and body and syncs labels", () => {
    const ep = createEmptyEndpoint();
    ep.url = "https://example.com/v1/{{channel}}/send";
    ep.headers = [createKeyValueItem("Authorization", "Bearer {{token}}")];
    ep.body.bodyType = "json";
    ep.body.rawContent = '{"phone": "{{phone}}", "seq": "{{$seq}}"}';
    ep.variables = [];

    const keys = detectEndpointCustomVars(ep);
    expect(keys).toEqual(["channel", "token", "phone"]);

    const synced = syncEndpointVariables(ep);
    expect(synced.map((v) => v.key)).toEqual(["channel", "token", "phone"]);
    expect(synced.find((v) => v.key === "phone")?.label).toBe("手机号");
  });
});
