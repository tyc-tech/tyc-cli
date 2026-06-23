import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("defaultCoreURL", () => {
  it("derives core endpoint from standard MCP v1 endpoint", async () => {
    const { defaultCoreURL } = await import("./config.js");
    expect(defaultCoreURL("https://mcp.tianyancha.com/v1")).toBe(
      "https://mcp.tianyancha.com/v1/core/tools/call",
    );
  });

  it("derives core endpoint from local MCP endpoint", async () => {
    const { defaultCoreURL } = await import("./config.js");
    expect(defaultCoreURL("http://localhost:8080/v1")).toBe(
      "http://localhost:8080/v1/core/tools/call",
    );
  });
});

describe("OAuth refresh config", () => {
  let homeDir: string | undefined;

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
    if (homeDir) {
      rmSync(homeDir, { recursive: true, force: true });
      homeDir = undefined;
    }
  });

  async function importConfigWithTempHome() {
    homeDir = mkdtempSync(join(tmpdir(), "tyc-cli-home-"));
    vi.stubEnv("HOME", homeDir);
    vi.resetModules();
    return import("./config.js");
  }

  it("refreshes an expiring OAuth access token and persists rotated refresh token", async () => {
    const {
      loadConfig,
      resolveConfigWithFreshOAuth,
      saveConfig,
    } = await importConfigWithTempHome();
    const now = Date.now();
    saveConfig({
      url: "https://mcp.example/mcp",
      coreUrl: "https://mcp.example/v1/core/tools/call",
      transport: "core",
      headers: { Authorization: "Bearer old-access-token" },
      oauth: {
        tokenEndpoint: "https://issuer.example/oauth/token",
        clientId: "client-1",
        clientSecret: "secret-1",
        refreshToken: "refresh-1",
        resource: "https://mcp.example/mcp",
        accessTokenExpiresAt: now + 5_000,
      },
    });

    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            access_token: "new-access-token",
            token_type: "Bearer",
            expires_in: 900,
            refresh_token: "refresh-2",
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveConfigWithFreshOAuth({ skewMs: 60_000 });

    expect(result.refreshed).toBe(true);
    expect(result.config.headers.Authorization).toBe("Bearer new-access-token");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = fetchMock.mock.calls[0][1]?.body as URLSearchParams;
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe("refresh-1");

    const saved = loadConfig();
    expect(saved?.headers?.Authorization).toBe("Bearer new-access-token");
    expect(saved?.oauth?.refreshToken).toBe("refresh-2");
    expect(saved?.oauth?.accessTokenExpiresAt).toBeGreaterThan(now + 800_000);

    const raw = readFileSync(join(homeDir!, ".tyc", "config.json"), "utf-8");
    expect(JSON.parse(raw).oauth.refreshToken).toBe("refresh-2");
  });

  it("does not refresh raw API key configs", async () => {
    const { resolveConfigWithFreshOAuth, saveConfig } = await importConfigWithTempHome();
    saveConfig({
      url: "https://mcp.example/mcp",
      headers: { Authorization: "raw-api-key" },
      oauth: {
        tokenEndpoint: "https://issuer.example/oauth/token",
        clientId: "client-1",
        refreshToken: "refresh-1",
        accessTokenExpiresAt: Date.now() - 1,
      },
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveConfigWithFreshOAuth({ force: true });

    expect(result.refreshed).toBe(false);
    expect(result.config.headers.Authorization).toBe("raw-api-key");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
