// MCP JSON-RPC over Streamable HTTP 客户端
//
// 职责：
//   1. initialize：拿 Mcp-Session-Id（服务端在响应 header 下发）
//   2. tools/call：透传 Authorization + Mcp-Session-Id，解析 SSE/JSON 响应
//   3. Session 失效（404/410 或服务端 "session not found"）→ 清 session → 重试 1 次
//
// 不做：
//   - 不维护 tools/list 缓存（CLI 命令树从本地 catalog.json 构建）
//   - 不做业务聚合/时间戳格式化（由 MCP Server 完成）
//   - 不做 Authorization 解析/验签

import type {
  JsonRpcRequest,
  JsonRpcResponse,
  McpToolCallResult,
  TycSession,
} from "./types.js";
import { clearSession, isSessionFresh, loadSession, saveSession } from "./session.js";
import type { ResolvedConfig } from "./config.js";
import { VERSION } from "./version.js";

export interface CallOptions {
  verbose?: boolean;
}

const PROTOCOL_VERSION = "2024-11-05";

function maskToken(v: string): string {
  if (!v) return "";
  if (v.length <= 8) return "****";
  return v.slice(0, 4) + "****" + v.slice(-4);
}

function logVerbose(cfg: ResolvedConfig, title: string, extra?: string): void {
  const masked: Record<string, string> = {};
  for (const [k, v] of Object.entries(cfg.headers)) {
    masked[k] = k.toLowerCase() === "authorization" ? maskToken(v) : v;
  }
  console.error(`> ${title}`);
  console.error(`> headers: ${JSON.stringify(masked)}`);
  if (extra) console.error(extra);
}

/** 解析 MCP Streamable HTTP 响应——server 端实测固定回 application/json 单包，
 *  无论 client Accept 头声明什么。SSE 路径不存在，所以只解析 JSON。 */
function parseJsonRpc<T>(raw: string): JsonRpcResponse<T> {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{")) {
    throw new Error(`Unparseable MCP response: ${trimmed.slice(0, 200)}`);
  }
  return JSON.parse(trimmed) as JsonRpcResponse<T>;
}

async function httpPost(
  url: string,
  headers: Record<string, string>,
  body: JsonRpcRequest,
  verbose: boolean
): Promise<{ status: number; text: string; headers: Headers }> {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    ...headers,
  };
  if (verbose) {
    console.error(`> POST ${url}`);
    const masked: Record<string, string> = {};
    for (const [k, v] of Object.entries(h)) {
      masked[k] = k.toLowerCase() === "authorization" ? maskToken(v) : v;
    }
    console.error(`> headers: ${JSON.stringify(masked)}`);
    console.error(`> body: ${JSON.stringify(body)}`);
  }
  const resp = await fetch(url, {
    method: "POST",
    headers: h,
    body: JSON.stringify(body),
  });
  const text = await resp.text();
  if (verbose) {
    console.error(`< ${resp.status} ${resp.statusText}`);
    console.error(`< body: ${text.slice(0, 2000)}`);
  }
  return { status: resp.status, text, headers: resp.headers };
}

async function doInitialize(
  cfg: ResolvedConfig,
  verbose: boolean
): Promise<TycSession> {
  if (verbose) logVerbose(cfg, `MCP initialize → ${cfg.url}`);
  const { status, text, headers } = await httpPost(
    cfg.url,
    cfg.headers,
    {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "tyc-cli", version: VERSION },
      },
    },
    verbose
  );
  if (status < 200 || status >= 300) {
    throw new Error(`initialize 失败：HTTP ${status}\n${text.slice(0, 500)}`);
  }
  const sessionId = headers.get("Mcp-Session-Id") || headers.get("mcp-session-id");
  if (!sessionId) {
    throw new Error(
      `initialize 响应未包含 Mcp-Session-Id header。请确认 ${cfg.url} 是 Streamable HTTP MCP Server。`
    );
  }
  const rpc = parseJsonRpc<{ protocolVersion?: string }>(text);
  if (rpc.error) {
    throw new Error(`initialize JSON-RPC error: ${rpc.error.message}`);
  }
  const s: TycSession = {
    url: cfg.url,
    sessionId,
    initializedAt: Date.now(),
    protocolVersion: rpc.result?.protocolVersion,
  };
  saveSession(s);
  return s;
}

/** 获取可用 session：若缓存新鲜则复用，否则 initialize + 落盘。 */
export async function ensureSession(
  cfg: ResolvedConfig,
  opts?: CallOptions
): Promise<TycSession> {
  const cached = loadSession();
  if (isSessionFresh(cached, cfg.url)) return cached!;
  return doInitialize(cfg, !!opts?.verbose);
}

function isSessionInvalidResponse(status: number, text: string): boolean {
  if (status === 404 || status === 410) return true;
  const lower = text.toLowerCase();
  return lower.includes("session not found") || lower.includes("invalid session");
}

/** 调用 MCP tool；透明处理 session 失效重建。 */
export async function callTool(
  cfg: ResolvedConfig,
  name: string,
  args: Record<string, unknown>,
  opts?: CallOptions
): Promise<McpToolCallResult> {
  const verbose = !!opts?.verbose;
  let session = await ensureSession(cfg, opts);

  const doCall = async (s: TycSession): Promise<{ status: number; text: string; headers: Headers }> => {
    const h: Record<string, string> = { ...cfg.headers, "Mcp-Session-Id": s.sessionId };
    return httpPost(
      cfg.url,
      h,
      {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name, arguments: args },
      },
      verbose
    );
  };

  let resp = await doCall(session);
  if (isSessionInvalidResponse(resp.status, resp.text)) {
    if (verbose) console.error("> session invalid, re-initializing …");
    clearSession();
    session = await doInitialize(cfg, verbose);
    resp = await doCall(session);
  }

  if (resp.status < 200 || resp.status >= 300) {
    throw new Error(`tools/call HTTP ${resp.status}\n${resp.text.slice(0, 500)}`);
  }

  const rpc = parseJsonRpc<McpToolCallResult>(resp.text);
  if (rpc.error) {
    throw new Error(`MCP error ${rpc.error.code}: ${rpc.error.message}`);
  }
  if (!rpc.result) {
    throw new Error("tools/call 响应缺少 result 字段");
  }
  return rpc.result;
}
