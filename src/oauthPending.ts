// ~/.tyc/oauth_pending.json 读写
//
// 非阻塞 OAuth 登录会保存一次性上下文：
// - legacy PKCE 模式保存 code_verifier/state，靠 --callback-token 续接；
// - RFC 8628 device flow 保存 device_code，靠 --resume 续接。
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const PENDING_DIR = join(homedir(), ".tyc");
export const PENDING_FILE = join(PENDING_DIR, "oauth_pending.json");

export interface PendingOAuthPKCELogin {
  version: 1;
  flow?: "pkce";
  createdAt: number;
  mcpURL: string;
  tokenEndpoint: string;
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  codeVerifier: string;
  resource?: string;
  state: string;
  verify: boolean;
}

export interface PendingOAuthDeviceLogin {
  version: 2;
  flow: "device";
  createdAt: number;
  mcpURL: string;
  tokenEndpoint: string;
  clientId: string;
  clientSecret?: string;
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresAt: number;
  interval: number;
  resource?: string;
  scope?: string;
  verify: boolean;
}

export type PendingOAuthLogin = PendingOAuthPKCELogin | PendingOAuthDeviceLogin;

export function loadPendingOAuthLogin(): PendingOAuthLogin | null {
  if (!existsSync(PENDING_FILE)) return null;
  try {
    const raw = readFileSync(PENDING_FILE, "utf-8");
    return JSON.parse(raw) as PendingOAuthLogin;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`读取 OAuth pending 状态失败：${PENDING_FILE}：${msg}`);
  }
}

export function savePendingOAuthLogin(pending: PendingOAuthLogin): void {
  if (!existsSync(PENDING_DIR)) mkdirSync(PENDING_DIR, { recursive: true, mode: 0o700 });
  writeFileSync(PENDING_FILE, JSON.stringify(pending, null, 2) + "\n", "utf-8");
  try { chmodSync(PENDING_FILE, 0o600); } catch { /* best effort */ }
}

export function clearPendingOAuthLogin(verbose = false): void {
  try {
    rmSync(PENDING_FILE, { force: true });
  } catch (err) {
    if (verbose) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`> 清理 OAuth pending 状态失败（忽略）：${PENDING_FILE}：${msg}`);
    }
  }
}
