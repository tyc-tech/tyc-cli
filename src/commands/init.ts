// tyc init：配置 MCP endpoint、Authorization、自定义 headers
//
// 行为：
//   1. 写入 ~/.tyc/config.json
//   2. 清除旧 session.json（endpoint/auth 变更必然使旧 session 无效）
//   3. 立即向目标 MCP Server 发一次 initialize 验证连通性并预热 session
//      —— 失败即退出非 0，让调用方（含测试 preflight）能明确感知
//
// 特殊选项：
//   --no-verify     仅写配置，不做 initialize 验证（离线配置场景）
//   --clear-session 仅清除本地 session（与 --no-verify 搭配可实现"只清 session"）
import type { Command } from "commander";
import {
  DEFAULT_MCP_URL,
  defaultCoreURL,
  loadConfig,
  resolveConfig,
  saveConfig,
  type Transport,
} from "../config.js";
import { verifyCoreEndpoint } from "../coreClient.js";
import { clearSession } from "../session.js";
import { ensureSession } from "../mcpClient.js";

function parseTransport(raw: string | undefined): Transport | undefined {
  if (!raw) return undefined;
  const v = raw.trim().toLowerCase();
  if (v === "core" || v === "mcp") return v;
  throw new Error(`invalid --transport: ${raw} (expected core or mcp)`);
}

export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .description("配置 MCP endpoint / Authorization（保存到 ~/.tyc/config.json，并校验连通性）")
    .option("--authorization <token>", "tyc OpenAPI Authorization（写入 headers.Authorization）")
    .option("--url <url>", `MCP endpoint（默认 ${DEFAULT_MCP_URL}）`)
    .option("--core-url <url>", "Shared Core HTTP endpoint（默认从 --url 推导 /v1/core/tools/call）")
    .option("--transport <core|mcp>", "默认调用通道（默认 core；mcp 保留旧 session 链路）")
    .option("--header <kv...>", "自定义 header，格式 K=V，可重复；留空清除该 key")
    .option("--clear-session", "仅清除本地 MCP session 缓存（~/.tyc/session.json）")
    .option("--no-verify", "跳过连通性校验（不发 initialize）")
    .action(async (opts: {
      authorization?: string;
      url?: string;
      coreUrl?: string;
      transport?: string;
      header?: string[];
      clearSession?: boolean;
      verify?: boolean; // commander 把 --no-verify 映射到 verify=false
    }) => {
      const cfg = loadConfig() || {};
      if (!cfg.headers) cfg.headers = {};

      if (opts.url) cfg.url = opts.url;
      if (!cfg.url) cfg.url = DEFAULT_MCP_URL;
      const transport = parseTransport(opts.transport);
      if (transport) cfg.transport = transport;
      if (!cfg.transport) cfg.transport = "core";
      if (opts.coreUrl) cfg.coreUrl = opts.coreUrl;
      if (!cfg.coreUrl) cfg.coreUrl = defaultCoreURL(cfg.url);

      if (opts.authorization) cfg.headers.Authorization = opts.authorization;

      if (opts.header && opts.header.length > 0) {
        for (const kv of opts.header) {
          const idx = kv.indexOf("=");
          if (idx < 0) {
            console.error(`忽略无效 header（缺 =）：${kv}`);
            continue;
          }
          const k = kv.slice(0, idx).trim();
          const v = kv.slice(idx + 1);
          if (!k) continue;
          if (v === "") delete cfg.headers[k];
          else cfg.headers[k] = v;
        }
      }

      saveConfig(cfg);
      // 任何配置变更都清掉 session 缓存，避免 endpoint/鉴权切换后复用旧 sessionId
      clearSession();
      if (opts.clearSession) {
        console.log("已清除 ~/.tyc/session.json");
      }
      console.log(`已保存 ~/.tyc/config.json  (transport=${cfg.transport}, url=${cfg.url}, coreUrl=${cfg.coreUrl})`);

      if (opts.verify === false) {
        return;
      }

      // core 模式只探活 stateless endpoint；mcp 模式才 initialize 并缓存 session。
      try {
        const resolved = resolveConfig();
        const verbose = !!program.opts().verbose;
        if (resolved.transport === "mcp") {
          const sess = await ensureSession(resolved, { verbose });
          console.log(`已建立 MCP session（sessionId=${sess.sessionId.slice(0, 16)}…）`);
        } else {
          await verifyCoreEndpoint(resolved, verbose);
          console.log("Shared Core endpoint 校验通过");
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`连通性校验失败：${msg}`);
        console.error("配置已保存；确认 --url 可达后重新运行 tyc init，或加 --no-verify 跳过校验。");
        process.exit(1);
      }
    });
}
