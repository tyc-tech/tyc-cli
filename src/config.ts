// ~/.tyc/config.json 读写
//
// 配置文件格式与通用 MCP 客户端保持一致：
//   { "url": "https://mcp.tianyancha.com/v1",
//     "headers": { "Authorization": "xxxx" } }
//
// 默认端点指向天眼查公网 MCP Server；连接本地或私有环境可通过
//   tyc init --url http://localhost:8080/v1 或 TYC_MCP_ENDPOINT 环境变量覆盖。
import { readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { TycConfig } from "./types.js";

const CONFIG_DIR = join(homedir(), ".tyc");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

export const DEFAULT_MCP_URL = "https://mcp.tianyancha.com/v1";

export function loadConfig(): TycConfig | null {
  if (!existsSync(CONFIG_FILE)) return null;
  try {
    const raw = readFileSync(CONFIG_FILE, "utf-8");
    return JSON.parse(raw) as TycConfig;
  } catch {
    return null;
  }
}

export function saveConfig(config: TycConfig): void {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + "\n", "utf-8");
  try { chmodSync(CONFIG_FILE, 0o600); } catch { /* best effort */ }
}

/** 解析后的配置：url 有默认值兜底 + headers 合并环境变量 */
export interface ResolvedConfig {
  url: string;
  headers: Record<string, string>;
}

export function resolveConfig(): ResolvedConfig {
  const cfg = loadConfig() || {};
  const url = process.env.TYC_MCP_ENDPOINT || cfg.url || DEFAULT_MCP_URL;
  const headers: Record<string, string> = { ...(cfg.headers || {}) };
  if (!headers.Authorization && process.env.TYC_AUTHORIZATION) {
    headers.Authorization = process.env.TYC_AUTHORIZATION;
  }
  if (!headers.Authorization) {
    console.error(
      "未配置 Authorization。请先运行：tyc init --authorization YOUR_API_KEY"
    );
    process.exit(1);
  }
  return { url, headers };
}
