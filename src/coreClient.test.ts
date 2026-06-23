import { afterEach, describe, expect, it, vi } from "vitest";
import { callCoreTool, verifyCoreAuthEndpoint } from "./coreClient.js";

const cfg = {
  url: "https://ai-mcp-pre.tianyancha.com/mcp",
  coreUrl: "https://ai-mcp-pre.tianyancha.com/v1/core/tools/call",
  headers: { Authorization: "Bearer token" },
};

describe("verifyCoreAuthEndpoint", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("checks the authenticated core readiness endpoint", async () => {
    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await verifyCoreAuthEndpoint(cfg);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://ai-mcp-pre.tianyancha.com/v1/core/auth/ready",
    );
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: "GET",
      headers: expect.objectContaining({ Authorization: "Bearer token" }),
    });
  });

  it("surfaces credential resolver failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: "credential_resolver_error",
              error_description:
                "credential resolver unavailable: server missing MCP_OAUTH_CREDENTIAL_RESOLVER_URL",
            }),
            { status: 502 },
          ),
      ),
    );

    await expect(verifyCoreAuthEndpoint(cfg)).rejects.toThrow(
      /credential resolver unavailable: server missing MCP_OAUTH_CREDENTIAL_RESOLVER_URL/,
    );
  });
});

describe("callCoreTool", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("passes markdown format and unwraps markdown content", async () => {
    const markdown = "# 公司工具可用情况\n\n| tool_name | 描述 |\n";
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            tool_name: "get_company_capabilities",
            format: "markdown",
            content: markdown,
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await callCoreTool(
      cfg,
      "get_company_capabilities",
      { company_id: "2319755677" },
      { format: "markdown" },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(init.body))).toMatchObject({
      tool_name: "get_company_capabilities",
      arguments: { company_id: "2319755677" },
      format: "markdown",
    });
    expect(result.content?.[0]).toEqual({ type: "text", text: markdown });
  });
});
