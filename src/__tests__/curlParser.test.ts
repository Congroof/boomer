import { describe, expect, it } from "vitest";
import { parseCurlToEndpoint } from "@/lib/curlParser";

describe("curlParser", () => {
  it("parses POST JSON cURL commands and extracts template variables", () => {
    const curl = `curl -X POST 'https://api.example.com/v1/notify?region=cn' \\
      -H 'Content-Type: application/json' \\
      -H 'X-Api-Key: secret-123' \\
      --data-raw '{"phone":"{{phone}}","code":"{{$random_int:1000:9999}}"}'`;

    const ep = parseCurlToEndpoint(curl);
    expect(ep.method).toBe("POST");
    expect(ep.url).toBe("https://api.example.com/v1/notify");
    expect(ep.queryParams).toHaveLength(1);
    expect(ep.queryParams[0].key).toBe("region");
    expect(ep.queryParams[0].value).toBe("cn");
    expect(ep.body.bodyType).toBe("json");
    expect(ep.variables.map((v) => v.key)).toEqual(["phone"]);
  });

  it("parses form-urlencoded cURL commands cleanly", () => {
    const curl = `curl https://api.example.com/login -d "phone={{phone}}&type=sms"`;
    const ep = parseCurlToEndpoint(curl);
    expect(ep.method).toBe("POST");
    expect(ep.body.bodyType).toBe("formUrlencoded");
    expect(ep.body.formItems).toHaveLength(2);
    expect(ep.body.formItems[0].key).toBe("phone");
    expect(ep.body.formItems[0].value).toBe("{{phone}}");
  });
});
