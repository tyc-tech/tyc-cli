// ~/.tyc/config.json 读写
//
// 配置文件格式：
//   { "url": "https://mcp.tianyancha.com/mcp",
//     "headers": { "Authorization": "xxxx" },
//     "coreUrl": "https://mcp.tianyancha.com/v1/core/tools/call" }
//
// 默认端点指向天眼查公网 MCP Server 的 canonical 入口 /mcp，CLI 实际调用
// shared core REST 端点；连接本地或私有环境可通过
//   tyc init --url http://localhost:8080/mcp 或 TYC_MCP_ENDPOINT 环境变量覆盖。
import { readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { exchangeRefreshToken, type OAuthTokenResponse } from "./oauth.js";
import type { TycConfig, TycOAuthConfig } from "./types.js";

const CONFIG_DIR = join(homedir(), ".tyc");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

export const DEFAULT_MCP_URL = "https://mcp.tianyancha.com/mcp";

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
  coreUrl: string;
  headers: Record<string, string>;
  oauth?: TycOAuthConfig;
}

export interface OAuthTokenStoreOptions {
  tokenEndpoint: string;
  clientId: string;
  clientSecret?: string;
  refreshToken?: string;
  resource?: string;
  scope?: string;
  now?: number;
}

export interface OAuthRefreshOptions {
  force?: boolean;
  verbose?: boolean;
  skewMs?: number;
}

export interface OAuthRefreshResult {
  config: ResolvedConfig;
  refreshed: boolean;
}

const OAUTH_REFRESH_SKEW_MS = 60 * 1000;

function normalizeTokenType(raw: string | undefined): string {
  if (!raw) return "Bearer";
  return raw.toLowerCase() === "bearer" ? "Bearer" : raw;
}

function jwtExpiresAt(accessToken: string): number | undefined {
  const parts = accessToken.split(".");
  if (parts.length < 2) return undefined;
  try {
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const payload = JSON.parse(Buffer.from(padded, "base64").toString("utf-8")) as {
      exp?: unknown;
    };
    if (typeof payload.exp === "number" && Number.isFinite(payload.exp)) {
      return payload.exp * 1000;
    }
  } catch {
    // Non-JWT access tokens are valid OAuth responses too; expires_in remains authoritative.
  }
  return undefined;
}

export function inferAccessTokenExpiresAt(
  token: Pick<OAuthTokenResponse, "access_token" | "expires_in">,
  now = Date.now(),
): number | undefined {
  if (typeof token.expires_in === "number" && Number.isFinite(token.expires_in) && token.expires_in > 0) {
    return now + token.expires_in * 1000;
  }
  return jwtExpiresAt(token.access_token);
}

export function applyOAuthTokenToConfig(
  config: TycConfig,
  token: OAuthTokenResponse,
  opts: OAuthTokenStoreOptions,
): void {
  const now = opts.now ?? Date.now();
  const tokenType = normalizeTokenType(token.token_type);
  const refreshToken = token.refresh_token || opts.refreshToken;
  if (!config.headers) config.headers = {};
  config.headers.Authorization = `${tokenType} ${token.access_token}`;
  if (!refreshToken) {
    delete config.oauth;
    return;
  }
  config.oauth = {
    tokenEndpoint: opts.tokenEndpoint,
    clientId: opts.clientId,
    clientSecret: opts.clientSecret,
    refreshToken,
    resource: opts.resource,
    scope: token.scope || opts.scope,
    tokenType,
    accessTokenExpiresAt: inferAccessTokenExpiresAt(token, now),
    updatedAt: now,
  };
}

export function defaultCoreURL(mcpURL: string): string {
  const u = new URL(mcpURL);
  const path = u.pathname.replace(/\/+$/, "");
  if (path === "" || path === "/v1" || path === "/mcp") {
    u.pathname = "/v1/core/tools/call";
  } else if (!path.endsWith("/core/tools/call")) {
    u.pathname = `${path}/core/tools/call`;
  }
  u.search = "";
  u.hash = "";
  return u.toString();
}

export function resolveConfig(): ResolvedConfig {
  const cfg = loadConfig() || {};
  const url = process.env.TYC_MCP_ENDPOINT || cfg.url || DEFAULT_MCP_URL;
  const coreUrl = process.env.TYC_CORE_ENDPOINT || cfg.coreUrl || defaultCoreURL(url);
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
  return { url, coreUrl, headers, oauth: cfg.oauth ? { ...cfg.oauth } : undefined };
}

function hasBearerAuthorization(config: ResolvedConfig): boolean {
  return /^Bearer\s+\S+/i.test(config.headers.Authorization || "");
}

function shouldRefreshOAuth(oauth: TycOAuthConfig, opts: OAuthRefreshOptions): boolean {
  if (opts.force) return true;
  if (!oauth.accessTokenExpiresAt) return false;
  const skewMs = opts.skewMs ?? OAUTH_REFRESH_SKEW_MS;
  return oauth.accessTokenExpiresAt <= Date.now() + skewMs;
}

export async function refreshResolvedConfigOAuth(
  resolved: ResolvedConfig,
  opts: OAuthRefreshOptions = {},
): Promise<OAuthRefreshResult> {
  const stored = loadConfig() || {};
  const oauth = stored.oauth;
  if (!oauth?.refreshToken || !oauth.tokenEndpoint || !oauth.clientId) {
    return { config: resolved, refreshed: false };
  }
  if (!hasBearerAuthorization(resolved)) {
    return { config: resolved, refreshed: false };
  }
  if (!shouldRefreshOAuth(oauth, opts)) {
    return { config: resolved, refreshed: false };
  }

  let token: OAuthTokenResponse;
  try {
    token = await exchangeRefreshToken({
      tokenEndpoint: oauth.tokenEndpoint,
      clientId: oauth.clientId,
      clientSecret: oauth.clientSecret,
      refreshToken: oauth.refreshToken,
      resource: oauth.resource,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`OAuth refresh token 刷新失败，请重新运行 tyc login：${msg}`);
  }

  applyOAuthTokenToConfig(stored, token, {
    tokenEndpoint: oauth.tokenEndpoint,
    clientId: oauth.clientId,
    clientSecret: oauth.clientSecret,
    refreshToken: oauth.refreshToken,
    resource: oauth.resource,
    scope: oauth.scope,
  });
  saveConfig(stored);
  if (opts.verbose) {
    console.error("> OAuth access token refreshed");
  }
  return { config: resolveConfig(), refreshed: true };
}

export async function resolveConfigWithFreshOAuth(
  opts: OAuthRefreshOptions = {},
): Promise<OAuthRefreshResult> {
  const resolved = resolveConfig();
  return refreshResolvedConfigOAuth(resolved, opts);
}
