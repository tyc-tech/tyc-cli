// Stateless apimcp shared-core HTTP client.
//
// It intentionally returns the MCP content shape so command output code can be
// shared by normal JSON tools and markdown capability discovery.
import type { ResolvedConfig } from "./config.js";
import type { McpToolCallResult } from "./types.js";

export interface CoreCallResponse {
  tool_name?: string;
  format?: string;
  content?: unknown;
  error?: string;
  error_description?: string;
  [k: string]: unknown;
}

export type CoreOutputFormat = "json" | "markdown";

export interface CoreCallOptions {
  verbose?: boolean;
  format?: CoreOutputFormat;
}

function maskToken(v: string): string {
  if (!v) return "";
  if (v.length <= 8) return "****";
  return v.slice(0, 4) + "****" + v.slice(-4);
}

function coreSiblingURL(coreUrl: string, siblingPath: string): string {
  const u = new URL(coreUrl);
  const path = u.pathname.replace(/\/+$/, "");
  if (path.endsWith("/tools/call")) {
    u.pathname = path.slice(0, -"/tools/call".length) + siblingPath;
  } else {
    u.pathname = path + siblingPath;
  }
  u.search = "";
  u.hash = "";
  return u.toString();
}

function readyURL(coreUrl: string): string {
  return coreSiblingURL(coreUrl, "/ready");
}

function authReadyURL(coreUrl: string): string {
  return coreSiblingURL(coreUrl, "/auth/ready");
}

export async function verifyCoreEndpoint(cfg: ResolvedConfig, verbose = false): Promise<void> {
  const url = readyURL(cfg.coreUrl);
  if (verbose) console.error(`> GET ${url}`);
  const resp = await fetch(url, {
    method: "GET",
    headers: { Accept: "text/plain" },
  });
  const text = await resp.text();
  if (verbose) {
    console.error(`< ${resp.status} ${resp.statusText}`);
    console.error(`< body: ${text.slice(0, 500)}`);
  }
  if (resp.status < 200 || resp.status >= 300) {
    throw new Error(`core endpoint 校验失败：HTTP ${resp.status}\n${text.slice(0, 500)}`);
  }
}

export async function verifyCoreAuthEndpoint(cfg: ResolvedConfig, verbose = false): Promise<void> {
  const url = authReadyURL(cfg.coreUrl);
  if (verbose) console.error(`> GET ${url}`);
  const headers: Record<string, string> = {
    Accept: "application/json, text/plain",
    ...cfg.headers,
  };
  const resp = await fetch(url, {
    method: "GET",
    headers,
  });
  const text = await resp.text();
  if (verbose) {
    console.error(`< ${resp.status} ${resp.statusText}`);
    console.error(`< body: ${text.slice(0, 500)}`);
  }
  if (resp.status < 200 || resp.status >= 300) {
    let desc = text.slice(0, 500);
    try {
      const parsed = JSON.parse(text) as CoreCallResponse;
      desc = String(parsed.error_description || parsed.error || desc);
    } catch {
      // keep raw text
    }
    throw new Error(`core/auth/ready HTTP ${resp.status}\n${desc}`);
  }
}

export async function callCoreTool(
  cfg: ResolvedConfig,
  name: string,
  args: Record<string, unknown>,
  opts?: CoreCallOptions,
): Promise<McpToolCallResult> {
  const verbose = !!opts?.verbose;
  const format = opts?.format || "json";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...cfg.headers,
  };
  const body = {
    tool_name: name,
    arguments: args,
    format,
  };
  if (verbose) {
    const masked: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) {
      masked[k] = k.toLowerCase() === "authorization" ? maskToken(v) : v;
    }
    console.error(`> POST ${cfg.coreUrl}`);
    console.error(`> headers: ${JSON.stringify(masked)}`);
    console.error(`> body: ${JSON.stringify(body)}`);
  }
  const resp = await fetch(cfg.coreUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await resp.text();
  if (verbose) {
    console.error(`< ${resp.status} ${resp.statusText}`);
    console.error(`< body: ${text.slice(0, 2000)}`);
  }
  let parsed: CoreCallResponse;
  try {
    parsed = JSON.parse(text) as CoreCallResponse;
  } catch {
    throw new Error(`core 响应不是 JSON：HTTP ${resp.status}\n${text.slice(0, 500)}`);
  }
  if (resp.status < 200 || resp.status >= 300) {
    const desc = parsed.error_description || parsed.error || text.slice(0, 500);
    throw new Error(`core/tools/call HTTP ${resp.status}\n${desc}`);
  }
  const content = parsed.content;
  const contentText =
    typeof content === "string" ? content : JSON.stringify(content ?? {});
  return {
    content: [{ type: "text", text: contentText }],
  };
}
