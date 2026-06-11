import type { Command } from "commander";
import {
  DEFAULT_MCP_URL,
  defaultCoreURL,
  loadConfig,
  resolveConfig,
  saveConfig,
} from "../config.js";
import { verifyCoreEndpoint } from "../coreClient.js";
import { clearSession } from "../session.js";
import { ensureSession } from "../mcpClient.js";
import {
  buildAuthorizationURL,
  createPKCE,
  discoverAuthorizationServer,
  discoverProtectedResourceMetadata,
  exchangeAuthorizationCode,
  knownOAuthDefaultsForMcpURL,
  openBrowser,
  randomState,
  registerDynamicOAuthClient,
  startCallbackServer,
  type OAuthEndpoints,
} from "../oauth.js";
import { printLoginSuccessBanner } from "../logo.js";

interface LoginOptions {
  url?: string;
  issuer?: string;
  clientId?: string;
  clientSecret?: string;
  scope?: string;
  resource?: string;
  resourceMetadataUrl?: string;
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  redirectHost?: string;
  redirectPort?: string;
  callbackPath?: string;
  open?: boolean;
  verify?: boolean;
}

function parsePort(raw: string | undefined): number {
  if (!raw) return 0;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 65535) {
    throw new Error(`invalid --redirect-port: ${raw}`);
  }
  return n;
}

function normalizeTokenType(raw: string | undefined): string {
  if (!raw) return "Bearer";
  return raw.toLowerCase() === "bearer" ? "Bearer" : raw;
}

export function registerLoginCommand(program: Command): void {
  program
    .command("login")
    .description("通过 OAuth 浏览器登录并自动写入 ~/.tyc/config.json")
    .option("--url <url>", `MCP endpoint（默认 ${DEFAULT_MCP_URL}，或沿用当前配置）`)
    .option("--issuer <url>", "OAuth authorization server issuer（默认从 MCP metadata 发现）")
    .option("--client-id <id>", "OAuth client_id（默认通过 DCR 自动注册）")
    .option("--client-secret <secret>", "OAuth client_secret（默认 TYC_OAUTH_CLIENT_SECRET；公共 CLI 通常不需要）")
    .option("--scope <scope>", "OAuth scope（默认 mcp:tools.call）")
    .option("--resource <url>", "OAuth resource/audience（默认从 MCP metadata 发现）")
    .option("--resource-metadata-url <url>", "手动指定 MCP protected resource metadata URL")
    .option("--authorization-endpoint <url>", "手动指定 OAuth authorization endpoint")
    .option("--token-endpoint <url>", "手动指定 OAuth token endpoint")
    .option("--redirect-host <host>", "本地回调 host（默认 localhost）")
    .option("--redirect-port <port>", "本地回调端口（默认 7078）")
    .option("--callback-path <path>", "本地回调路径（默认 /oauth/callback）")
    .option("--no-open", "不自动打开浏览器，只打印授权 URL")
    .option("--no-verify", "保存 token 后跳过 initialize 连通性校验")
    .action(async (opts: LoginOptions) => {
      const current = loadConfig() || {};
      const mcpURL = opts.url || process.env.TYC_MCP_ENDPOINT || current.url || DEFAULT_MCP_URL;
      const knownDefaults = knownOAuthDefaultsForMcpURL(mcpURL);
      let clientId = opts.clientId || process.env.TYC_OAUTH_CLIENT_ID || "";
      let clientSecret = opts.clientSecret || process.env.TYC_OAUTH_CLIENT_SECRET;
      const scope = opts.scope || "mcp:tools.call";
      const redirectHost = opts.redirectHost || "localhost";
      const redirectPort = parsePort(opts.redirectPort || "7078");
      const callbackPath = opts.callbackPath || "/oauth/callback";
      const verbose = !!program.opts().verbose;

      let issuer = opts.issuer || "";
      let resource = opts.resource || "";
      if (!opts.issuer || !opts.resource) {
        console.error(`发现 MCP OAuth metadata：${mcpURL}`);
        try {
          const protectedResource = await discoverProtectedResourceMetadata(
            mcpURL,
            opts.resourceMetadataUrl,
          );
          if (verbose) {
            console.error(`> protected resource metadata: ${protectedResource.metadataURL}`);
          }
          const metadataIssuer = protectedResource.metadata.authorization_servers?.[0];
          if (!issuer && metadataIssuer) {
            issuer = metadataIssuer;
          }
          resource ||= protectedResource.metadata.resource || mcpURL;
        } catch (err) {
          issuer ||= knownDefaults.issuer || "";
          resource ||= knownDefaults.resource || "";
          if (!issuer || !resource) {
            throw err;
          }
          if (verbose) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`> metadata discovery failed, using known defaults: ${msg}`);
          }
        }
      } else if (verbose) {
        console.error("> using explicit --issuer and --resource; skip protected resource metadata discovery");
      }

      if (!issuer) {
        throw new Error("MCP metadata 未提供 authorization_servers，请用 --issuer 指定。");
      }
      // 双端点都手动指定时跳过自动发现；否则 metadata 发现失败会直接报错
      // （discovery 不再猜测端点，见 discoverAuthorizationServer）。
      let endpoints: OAuthEndpoints;
      if (opts.authorizationEndpoint && opts.tokenEndpoint) {
        endpoints = {
          authorizationEndpoint: opts.authorizationEndpoint,
          tokenEndpoint: opts.tokenEndpoint,
          issuer,
        };
      } else {
        endpoints = await discoverAuthorizationServer(issuer);
        endpoints.authorizationEndpoint =
          opts.authorizationEndpoint || endpoints.authorizationEndpoint;
        endpoints.tokenEndpoint = opts.tokenEndpoint || endpoints.tokenEndpoint;
      }
      resource ||= endpoints.resourceDocumentation || mcpURL;
      if (verbose) {
        console.error(`> authorization endpoint: ${endpoints.authorizationEndpoint}`);
        console.error(`> token endpoint: ${endpoints.tokenEndpoint}`);
        if (endpoints.registrationEndpoint) {
          console.error(`> registration endpoint: ${endpoints.registrationEndpoint}`);
        }
      }

      const state = randomState();
      const pkce = createPKCE();
      const callback = await startCallbackServer({
        host: redirectHost,
        port: redirectPort,
        path: callbackPath.startsWith("/") ? callbackPath : `/${callbackPath}`,
        state,
        timeoutMs: 5 * 60 * 1000,
      });
      if (!clientId) {
        if (!endpoints.registrationEndpoint) {
          callback.close();
          throw new Error(
            "OAuth metadata 未提供 registration_endpoint，请用 --client-id 指定预注册客户端。",
          );
        }
        console.error("正在通过 Dynamic Client Registration 注册 OAuth client...");
        let registeredClient: Awaited<ReturnType<typeof registerDynamicOAuthClient>>;
        try {
          registeredClient = await registerDynamicOAuthClient({
            registrationEndpoint: endpoints.registrationEndpoint,
            clientName: "tyc-cli",
            redirectUris: [callback.redirectUri],
            tokenEndpointAuthMethod: "none",
          });
        } catch (err) {
          callback.close();
          throw err;
        }
        clientId = registeredClient.clientId;
        clientSecret ||= registeredClient.clientSecret;
        if (verbose) {
          console.error(`> registered client_id: ${clientId}`);
        }
      }
      const authorizationURL = buildAuthorizationURL({
        authorizationEndpoint: endpoints.authorizationEndpoint,
        clientId,
        redirectUri: callback.redirectUri,
        scope,
        state,
        codeChallenge: pkce.codeChallenge,
        resource,
      });

      console.error(`OAuth 回调地址：${callback.redirectUri}`);
      if (opts.open === false) {
        console.error("请在浏览器打开以下 URL 完成登录：");
        console.error(authorizationURL);
      } else {
        console.error("正在打开浏览器完成 OAuth 登录...");
        openBrowser(authorizationURL);
      }

      const code = await callback.waitForCode();
      console.error("已收到授权码，正在换取 access token...");
      const token = await exchangeAuthorizationCode({
        tokenEndpoint: endpoints.tokenEndpoint,
        clientId,
        clientSecret,
        code,
        redirectUri: callback.redirectUri,
        codeVerifier: pkce.codeVerifier,
        resource,
      });

      const cfg = loadConfig() || {};
      cfg.url = mcpURL;
      if (!cfg.transport) cfg.transport = "core";
      if (!cfg.coreUrl) cfg.coreUrl = defaultCoreURL(mcpURL);
      cfg.headers = { ...(cfg.headers || {}) };
      cfg.headers.Authorization = `${normalizeTokenType(token.token_type)} ${token.access_token}`;
      saveConfig(cfg);
      clearSession();
      console.log(`已保存 OAuth 登录态到 ~/.tyc/config.json  (url=${cfg.url})`);

      if (opts.verify === false) {
        printLoginSuccessBanner();
        return;
      }

      const resolved = resolveConfig();
      if (resolved.transport === "mcp") {
        const sess = await ensureSession(resolved, { verbose });
        console.log(`已建立 MCP session（sessionId=${sess.sessionId.slice(0, 16)}…）`);
      } else {
        await verifyCoreEndpoint(resolved, verbose);
        console.log("Shared Core endpoint 校验通过");
      }
      printLoginSuccessBanner();
    });
}
