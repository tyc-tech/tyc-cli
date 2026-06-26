import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("init command auth output", () => {
  let homeDir: string | undefined;

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
    if (homeDir) {
      rmSync(homeDir, { recursive: true, force: true });
      homeDir = undefined;
    }
  });

  async function runInit(args: string[]) {
    homeDir = mkdtempSync(join(tmpdir(), "tyc-cli-home-"));
    vi.stubEnv("HOME", homeDir);
    vi.resetModules();

    const { registerInitCommand } = await import("./init.js");
    const program = new Command();
    program.name("tyc");
    program.exitOverride();
    registerInitCommand(program);

    await program.parseAsync(["node", "tyc", ...args]);

    const { loadConfig } = await import("../config.js");
    return loadConfig();
  }

  it("does not print the login banner when auth only comes from TYC_AUTHORIZATION", async () => {
    vi.stubEnv("TYC_AUTHORIZATION", "env-token");
    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const logMock = vi.spyOn(console, "log").mockImplementation(() => {});

    const saved = await runInit(["init", "--url", "https://mcp.example/mcp"]);

    const stdout = logMock.mock.calls.map((call) => String(call[0])).join("\n");
    expect(stdout).not.toContain("登录成功");
    expect(stdout).not.toContain("公平看清世界");
    expect(stdout).toContain("TYC_AUTHORIZATION");
    expect(saved?.headers?.Authorization).toBeUndefined();
    expect(fetchMock.mock.calls[0][0]).toBe("https://mcp.example/v1/core/auth/ready");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      headers: expect.objectContaining({ Authorization: "env-token" }),
    });
  });

  it("prints the login banner when the authorization is saved", async () => {
    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const logMock = vi.spyOn(console, "log").mockImplementation(() => {});

    const saved = await runInit([
      "init",
      "--authorization",
      "api-token",
      "--url",
      "https://mcp.example/mcp",
    ]);

    const stdout = logMock.mock.calls.map((call) => String(call[0])).join("\n");
    expect(stdout).toContain("登录成功");
    expect(stdout).toContain("公平看清世界");
    expect(saved?.headers?.Authorization).toBe("api-token");
    expect(fetchMock.mock.calls[0][0]).toBe("https://mcp.example/v1/core/auth/ready");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      headers: expect.objectContaining({ Authorization: "api-token" }),
    });
  });
});
