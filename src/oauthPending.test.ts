import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("OAuth pending state", () => {
  let homeDir: string | undefined;

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.resetModules();
    if (homeDir) {
      rmSync(homeDir, { recursive: true, force: true });
      homeDir = undefined;
    }
  });

  async function importPendingWithTempHome() {
    homeDir = join(tmpdir(), `tyc-cli-pending-${Date.now()}-${Math.random()}`);
    vi.stubEnv("HOME", homeDir);
    vi.resetModules();
    return import("./oauthPending.js");
  }

  it("returns null when the pending file does not exist", async () => {
    const { loadPendingOAuthLogin } = await importPendingWithTempHome();

    expect(loadPendingOAuthLogin()).toBeNull();
  });

  it("throws a path-aware error when the pending file cannot be parsed", async () => {
    const { PENDING_FILE, loadPendingOAuthLogin } = await importPendingWithTempHome();
    mkdirSync(join(homeDir!, ".tyc"), { recursive: true });
    writeFileSync(PENDING_FILE, "{not json", "utf-8");

    expect(() => loadPendingOAuthLogin()).toThrow(`读取 OAuth pending 状态失败：${PENDING_FILE}`);
  });

  it("logs clear failures only in verbose mode", async () => {
    const pending = await importPendingWithTempHome();
    const rmError = new Error("permission denied");
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.doMock("node:fs", async () => {
      const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
      return {
        ...actual,
        rmSync: () => {
          throw rmError;
        },
      };
    });
    vi.resetModules();
    const { clearPendingOAuthLogin, PENDING_FILE } = await import("./oauthPending.js");

    clearPendingOAuthLogin(false);
    expect(consoleSpy).not.toHaveBeenCalled();

    clearPendingOAuthLogin(true);
    expect(consoleSpy).toHaveBeenCalledWith(
      `> 清理 OAuth pending 状态失败（忽略）：${PENDING_FILE}：${rmError.message}`,
    );

    vi.doUnmock("node:fs");
    pending.clearPendingOAuthLogin();
  });
});
