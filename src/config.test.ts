import { describe, expect, it } from "vitest";
import { defaultCoreURL } from "./config.js";

describe("defaultCoreURL", () => {
  it("derives core endpoint from standard MCP v1 endpoint", () => {
    expect(defaultCoreURL("https://mcp.tianyancha.com/v1")).toBe(
      "https://mcp.tianyancha.com/v1/core/tools/call",
    );
  });

  it("derives core endpoint from local MCP endpoint", () => {
    expect(defaultCoreURL("http://localhost:8080/v1")).toBe(
      "http://localhost:8080/v1/core/tools/call",
    );
  });
});
