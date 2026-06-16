import { describe, expect, it } from "vitest";
import { knownOAuthDefaultsForMcpURL } from "./oauth.js";

describe("knownOAuthDefaultsForMcpURL", () => {
  it("keeps the resource aligned with the configured MCP endpoint path", () => {
    expect(knownOAuthDefaultsForMcpURL("https://ai-mcp-pre.tianyancha.com/v1")).toMatchObject({
      issuer: "https://ai-pre.tianyancha.com/oauth",
      resource: "https://ai-mcp-pre.tianyancha.com/v1",
    });
    expect(knownOAuthDefaultsForMcpURL("https://mcp.tianyancha.com/v1")).toMatchObject({
      issuer: "https://ai.tianyancha.com/oauth",
      resource: "https://mcp.tianyancha.com/v1",
    });
    expect(knownOAuthDefaultsForMcpURL("https://mcp.tianyancha.com/mcp")).toMatchObject({
      issuer: "https://ai.tianyancha.com/oauth",
      resource: "https://mcp.tianyancha.com/mcp",
    });
  });
});
