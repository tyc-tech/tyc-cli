import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

export interface ProtectedResourceMetadata {
  resource?: string;
  authorization_servers?: string[];
  scopes_supported?: string[];
  [k: string]: unknown;
}

export interface AuthorizationServerMetadata {
  issuer?: string;
  authorization_endpoint?: string;
  token_endpoint?: string;
  scopes_supported?: string[];
  code_challenge_methods_supported?: string[];
  [k: string]: unknown;
}

export interface OAuthTokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  [k: string]: unknown;
}

export interface OAuthEndpoints {
  authorizationEndpoint: string;
  tokenEndpoint: string;
  issuer: string;
  resourceDocumentation?: string;
}

export interface CallbackServer {
  redirectUri: string;
  waitForCode(): Promise<string>;
}

export interface KnownOAuthDefaults {
  issuer?: string;
  resource?: string;
}

function trimRightSlash(v: string): string {
  return v.replace(/\/+$/, "");
}

function joinURL(base: string, path: string): string {
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;
  return new URL(path.replace(/^\/+/, ""), normalizedBase).toString();
}

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.headers || {}),
    },
  });
  const text = await resp.text();
  if (resp.status < 200 || resp.status >= 300) {
    throw new Error(`HTTP ${resp.status} from ${url}: ${text.slice(0, 300)}`);
  }
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid JSON from ${url}: ${msg}`);
  }
}

function protectedResourceMetadataCandidates(mcpURL: string): string[] {
  const u = new URL(mcpURL);
  const path = trimRightSlash(u.pathname);
  const out = [
    `${u.origin}/.well-known/oauth-protected-resource${path === "" ? "" : path}`,
    `${u.origin}/.well-known/oauth-protected-resource`,
  ];
  return Array.from(new Set(out));
}

function authServerMetadataCandidates(issuer: string): string[] {
  const u = new URL(issuer);
  const path = trimRightSlash(u.pathname);
  const pathSuffix = path === "" ? "" : path;
  const out = [
    `${u.origin}/.well-known/oauth-authorization-server${pathSuffix}`,
    `${u.origin}/.well-known/openid-configuration${pathSuffix}`,
    joinURL(issuer, ".well-known/oauth-authorization-server"),
    joinURL(issuer, ".well-known/openid-configuration"),
  ];
  return Array.from(new Set(out));
}

function parseWWWAuthenticateParam(header: string | null, key: string): string | undefined {
  if (!header) return undefined;
  const re = new RegExp(`${key}\\s*=\\s*"((?:[^"\\\\]|\\\\.)*)"`, "i");
  const quoted = header.match(re);
  if (quoted) return quoted[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  const bare = header.match(new RegExp(`${key}\\s*=\\s*([^,\\s]+)`, "i"));
  return bare?.[1];
}

async function discoverMetadataURLFromChallenge(mcpURL: string): Promise<string | undefined> {
  const resp = await fetch(mcpURL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "search_companies", arguments: { searchKey: "test" } },
    }),
  });
  return parseWWWAuthenticateParam(resp.headers.get("www-authenticate"), "resource_metadata");
}

export async function discoverProtectedResourceMetadata(
  mcpURL: string,
  overrideURL?: string,
): Promise<{ metadata: ProtectedResourceMetadata; metadataURL: string }> {
  const candidates = overrideURL
    ? [overrideURL]
    : protectedResourceMetadataCandidates(mcpURL);
  const errors: string[] = [];
  for (const url of candidates) {
    try {
      return { metadata: await fetchJSON<ProtectedResourceMetadata>(url), metadataURL: url };
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  if (!overrideURL) {
    try {
      const challengedURL = await discoverMetadataURLFromChallenge(mcpURL);
      if (challengedURL) {
        return {
          metadata: await fetchJSON<ProtectedResourceMetadata>(challengedURL),
          metadataURL: challengedURL,
        };
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  throw new Error(
    `无法发现 OAuth protected resource metadata。请确认 MCP Server 已部署该端点，或使用 --resource-metadata-url 指定。\n${errors.join("\n")}`,
  );
}

export async function discoverAuthorizationServer(
  issuer: string,
): Promise<OAuthEndpoints> {
  const errors: string[] = [];
  for (const url of authServerMetadataCandidates(issuer)) {
    try {
      const metadata = await fetchJSON<AuthorizationServerMetadata>(url);
      if (metadata.authorization_endpoint && metadata.token_endpoint) {
        return {
          authorizationEndpoint: metadata.authorization_endpoint,
          tokenEndpoint: metadata.token_endpoint,
          issuer: metadata.issuer || issuer,
          resourceDocumentation:
            typeof metadata.resource_documentation === "string"
              ? metadata.resource_documentation
              : undefined,
        };
      }
      errors.push(`metadata missing endpoints: ${url}`);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  return {
    authorizationEndpoint: joinURL(issuer, "authorize"),
    tokenEndpoint: joinURL(issuer, "token"),
    issuer,
  };
}

export function knownOAuthDefaultsForMcpURL(mcpURL: string): KnownOAuthDefaults {
  const u = new URL(mcpURL);
  switch (u.hostname) {
    case "ai-mcp-pre.tianyancha.com":
      return {
        issuer: "https://ai-pre.tianyancha.com/oauth",
        resource: "https://ai-mcp-pre.tianyancha.com/mcp",
      };
    case "mcp.tianyancha.com":
      return {
        issuer: "https://ai.tianyancha.com/oauth",
        resource: "https://mcp.tianyancha.com/mcp",
      };
    default:
      return {};
  }
}

export function createPKCE(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
  return { codeVerifier, codeChallenge };
}

export function randomState(): string {
  return randomBytes(24).toString("base64url");
}

function callbackHTML(title: string, body: string): string {
  return `<!doctype html>
<meta charset="utf-8">
<title>${title}</title>
<body style="font-family: system-ui, -apple-system, sans-serif; line-height: 1.5; padding: 32px;">
  <h1>${title}</h1>
  <p>${body}</p>
</body>`;
}

export async function startCallbackServer(opts: {
  host: string;
  port: number;
  path: string;
  state: string;
  timeoutMs: number;
}): Promise<CallbackServer> {
  let server: Server | undefined;
  let settled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const codePromise = new Promise<string>((resolve, reject) => {
    timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("等待 OAuth 回调超时"));
      server?.close();
    }, opts.timeoutMs);

    server = createServer((req, res) => {
      const url = new URL(req.url || "/", `http://${req.headers.host || opts.host}`);
      if (url.pathname !== opts.path) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Not found");
        return;
      }
      if (settled) {
        res.writeHead(409, { "Content-Type": "text/html; charset=utf-8" });
        res.end(callbackHTML("OAuth 已处理", "可以关闭这个窗口。"));
        return;
      }
      const gotState = url.searchParams.get("state") || "";
      const error = url.searchParams.get("error");
      const errorDescription = url.searchParams.get("error_description");
      const code = url.searchParams.get("code");

      if (gotState !== opts.state) {
        settled = true;
        res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        res.end(callbackHTML("OAuth 登录失败", "state 校验失败，请回到终端重新运行 tyc login。"));
        reject(new Error("OAuth state mismatch"));
        server?.close();
        return;
      }
      if (error) {
        settled = true;
        res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        res.end(callbackHTML("OAuth 登录失败", errorDescription || error));
        reject(new Error(`OAuth error: ${errorDescription || error}`));
        server?.close();
        return;
      }
      if (!code) {
        settled = true;
        res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        res.end(callbackHTML("OAuth 登录失败", "授权服务未返回 code。"));
        reject(new Error("OAuth callback missing code"));
        server?.close();
        return;
      }

      settled = true;
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(callbackHTML("OAuth 登录成功", "tyc CLI 已收到授权结果，可以关闭这个窗口。"));
      resolve(code);
      server?.close();
    });
  });

  await new Promise<void>((resolve, reject) => {
    if (!server) {
      reject(new Error("callback server not initialized"));
      return;
    }
    const onError = (err: Error): void => reject(err);
    server.once("error", onError);
    server.listen(opts.port, opts.host, () => {
      server?.off("error", onError);
      resolve();
    });
  });

  const address = server?.address() as AddressInfo | null;
  if (!address || typeof address.port !== "number") {
    server?.close();
    throw new Error("无法启动 OAuth 本地回调服务");
  }

  const redirectUri = `http://${opts.host}:${address.port}${opts.path}`;
  return {
    redirectUri,
    waitForCode: async () => {
      try {
        return await codePromise;
      } finally {
        if (timer) clearTimeout(timer);
        server?.close();
      }
    },
  };
}

export function buildAuthorizationURL(opts: {
  authorizationEndpoint: string;
  clientId: string;
  redirectUri: string;
  scope: string;
  state: string;
  codeChallenge: string;
  resource?: string;
}): string {
  const url = new URL(opts.authorizationEndpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", opts.clientId);
  url.searchParams.set("redirect_uri", opts.redirectUri);
  url.searchParams.set("scope", opts.scope);
  url.searchParams.set("state", opts.state);
  url.searchParams.set("code_challenge", opts.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  if (opts.resource) url.searchParams.set("resource", opts.resource);
  return url.toString();
}

export async function exchangeAuthorizationCode(opts: {
  tokenEndpoint: string;
  clientId: string;
  clientSecret?: string;
  code: string;
  redirectUri: string;
  codeVerifier: string;
  resource?: string;
}): Promise<OAuthTokenResponse> {
  const body = new URLSearchParams();
  body.set("grant_type", "authorization_code");
  body.set("client_id", opts.clientId);
  body.set("code", opts.code);
  body.set("redirect_uri", opts.redirectUri);
  body.set("code_verifier", opts.codeVerifier);
  if (opts.clientSecret) body.set("client_secret", opts.clientSecret);
  if (opts.resource) body.set("resource", opts.resource);

  const resp = await fetch(opts.tokenEndpoint, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const text = await resp.text();
  if (resp.status < 200 || resp.status >= 300) {
    throw new Error(`token endpoint HTTP ${resp.status}: ${text.slice(0, 500)}`);
  }
  const token = JSON.parse(text) as Partial<OAuthTokenResponse>;
  if (!token.access_token) {
    throw new Error("token endpoint response missing access_token");
  }
  return token as OAuthTokenResponse;
}

export function openBrowser(url: string): void {
  const platform = process.platform;
  let command: string;
  let args: string[];
  if (platform === "darwin") {
    command = "open";
    args = [url];
  } else if (platform === "win32") {
    command = "cmd";
    args = ["/c", "start", "", url];
  } else {
    command = "xdg-open";
    args = [url];
  }
  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}
