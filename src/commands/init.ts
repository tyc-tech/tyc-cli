// tyc init：配置 endpoint、Authorization、自定义 headers
//
// 行为：
//   1. 写入 ~/.tyc/config.json
//   2. 立即校验配置：带 Authorization 时检查 /auth/ready，否则检查 /ready
//      —— 失败即退出非 0，让调用方（含测试 preflight）能明确感知
//
// 特殊选项：
//   --no-verify     仅写配置，不做连通性验证（离线配置场景）
import type { Command } from "commander";
import {
  DEFAULT_MCP_URL,
  defaultCoreURL,
  loadConfig,
  saveConfig,
} from "../config.js";
import { verifyCoreAuthEndpoint, verifyCoreEndpoint } from "../coreClient.js";
import { printLoginSuccessBanner } from "../logo.js";

export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .description("配置 endpoint / Authorization（保存到 ~/.tyc/config.json，并校验配置）")
    .option("--authorization <token>", "tyc OpenAPI Authorization（写入 headers.Authorization）")
    .option("--url <url>", `MCP endpoint（默认 ${DEFAULT_MCP_URL}）`)
    .option("--core-url <url>", "Shared Core HTTP endpoint（默认从 --url 推导 /v1/core/tools/call）")
    .option("--header <kv...>", "自定义 header，格式 K=V，可重复；留空清除该 key")
    .option("--no-verify", "跳过 shared core 连通性校验")
    .action(async (opts: {
      authorization?: string;
      url?: string;
      coreUrl?: string;
      header?: string[];
      verify?: boolean; // commander 把 --no-verify 映射到 verify=false
    }) => {
      const cfg = loadConfig() || {};
      if (!cfg.headers) cfg.headers = {};

      let resetOAuth = false;
      if (opts.url) {
        cfg.url = opts.url;
        resetOAuth = true;
      }
      if (!cfg.url) cfg.url = DEFAULT_MCP_URL;
      delete (cfg as Record<string, unknown>).transport;
      if (opts.coreUrl) {
        cfg.coreUrl = opts.coreUrl;
      } else if (opts.url || !cfg.coreUrl) {
        cfg.coreUrl = defaultCoreURL(cfg.url);
      }

      if (opts.authorization) {
        cfg.headers.Authorization = opts.authorization;
        resetOAuth = true;
      }

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
          if (k.toLowerCase() === "authorization") resetOAuth = true;
          if (v === "") delete cfg.headers[k];
          else cfg.headers[k] = v;
        }
      }

      if (resetOAuth) delete cfg.oauth;

      saveConfig(cfg);
      const verbose = !!program.opts().verbose;
      if (verbose) {
        console.error(`> config saved to ~/.tyc/config.json (url=${cfg.url}, coreUrl=${cfg.coreUrl})`);
      }

      if (opts.verify === false) {
        console.log(`已保存 ~/.tyc/config.json  (url=${cfg.url}, coreUrl=${cfg.coreUrl})`);
        return;
      }

      try {
        const verifyConfig = {
          url: cfg.url,
          coreUrl: cfg.coreUrl || defaultCoreURL(cfg.url),
          headers: { ...(cfg.headers || {}) },
        };
        if (!verifyConfig.headers.Authorization && process.env.TYC_AUTHORIZATION) {
          verifyConfig.headers.Authorization = process.env.TYC_AUTHORIZATION;
        }

        if (verifyConfig.headers.Authorization?.trim()) {
          await verifyCoreAuthEndpoint(verifyConfig, verbose);
          if (verbose) {
            console.error("> Shared Core auth check passed");
          }
          printLoginSuccessBanner();
        } else {
          await verifyCoreEndpoint(verifyConfig, verbose);
          console.log("Shared Core endpoint 校验通过");
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`配置校验失败：${msg}`);
        console.error("配置已保存；确认 --url 可达且 Authorization 有效后重新运行 tyc init，或加 --no-verify 跳过校验。");
        process.exit(1);
      }
    });
}
