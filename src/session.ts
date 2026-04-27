// ~/.tyc/session.json 读写 + 24h TTL
//
// TTL 规则（按字面 24h，从 initializedAt 起）：
//   - 命中：复用 sessionId，跳过 initialize
//   - 过期 / url 变化：强制重新 initialize
//   - 服务端主动失效（4xx + session 提示）：mcpClient 调 clearSession 后重建
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { TycSession } from "./types.js";

const SESSION_DIR = join(homedir(), ".tyc");
const SESSION_FILE = join(SESSION_DIR, "session.json");

export const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24h 字面

export function loadSession(): TycSession | null {
  if (!existsSync(SESSION_FILE)) return null;
  try {
    const raw = readFileSync(SESSION_FILE, "utf-8");
    return JSON.parse(raw) as TycSession;
  } catch {
    return null;
  }
}

export function saveSession(s: TycSession): void {
  if (!existsSync(SESSION_DIR)) mkdirSync(SESSION_DIR, { recursive: true, mode: 0o700 });
  writeFileSync(SESSION_FILE, JSON.stringify(s, null, 2) + "\n", "utf-8");
  try { chmodSync(SESSION_FILE, 0o600); } catch { /* best effort */ }
}

export function clearSession(): void {
  try { rmSync(SESSION_FILE, { force: true }); } catch { /* ignore */ }
}

export function isSessionFresh(s: TycSession | null, url: string, now = Date.now()): boolean {
  if (!s) return false;
  if (s.url !== url) return false;
  if (!s.sessionId) return false;
  return now - s.initializedAt < SESSION_TTL_MS;
}
