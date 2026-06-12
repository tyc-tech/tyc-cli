import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyCoreAuthEndpoint } from "./coreClient.js";

const cfg = {
  url: "https://ai-mcp-pre.tianyancha.com/mcp",
  coreUrl: "https://ai-mcp-pre.tianyancha.com/v1/core/tools/call",
  transport: "core" as const,
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
