import type { Command } from "commander";
import {
  DEFAULT_MCP_URL,
  applyOAuthTokenToConfig,
  defaultCoreURL,
  loadConfig,
  resolveConfig,
  saveConfig,
  type OAuthTokenStoreOptions,
} from "../config.js";
import { verifyCoreAuthEndpoint } from "../coreClient.js";
import {
  buildAuthorizationURL,
  type CallbackServer,
  createPKCE,
  discoverAuthorizationServer,
  discoverProtectedResourceMetadata,
  exchangeAuthorizationCode,
  knownOAuthDefaultsForMcpURL,
  openBrowser,
  parseAuthorizationCallbackCode,
  randomState,
  registerDynamicOAuthClient,
  startCallbackServer,
  type OAuthEndpoints,
} from "../oauth.js";
import {
  clearPendingOAuthLogin,
  loadPendingOAuthLogin,
  savePendingOAuthLogin,
  type PendingOAuthLogin,
} from "../oauthPending.js";
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
  callbackToken?: string;
  token?: string;
  open?: boolean;
  block?: boolean;
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

function normalizeCallbackPath(raw: string | undefined): string {
  const path = raw || "/oauth/callback";
  return path.startsWith("/") ? path : `/${path}`;
}

function buildLoopbackRedirectUri(host: string, port: number, path: string): string {
  if (port === 0) {
    throw new Error("--no-block 不能与 --redirect-port 0 同时使用，请指定固定回调端口。");
  }
  return `http://${host}:${port}${path}`;
}

function pickCallbackToken(opts: LoginOptions): string | undefined {
  if (opts.callbackToken && opts.token) {
    throw new Error("--callback-token 和 --token 只能指定一个。");
  }
  return opts.callbackToken || opts.token;
}

function saveOAuthTokenConfig(
  mcpURL: string,
  token: Awaited<ReturnType<typeof exchangeAuthorizationCode>>,
  oauth: OAuthTokenStoreOptions,
  verbose: boolean,
): void {
  const cfg = loadConfig() || {};
  cfg.url = mcpURL;
  delete (cfg as Record<string, unknown>).transport;
  cfg.coreUrl = defaultCoreURL(mcpURL);
  applyOAuthTokenToConfig(cfg, token, oauth);
  saveConfig(cfg);
  if (verbose) {
    console.error(`> OAuth login state saved to ~/.tyc/config.json (url=${cfg.url})`);
  }
}

async function verifySavedOAuthLogin(verify: boolean, verbose: boolean): Promise<void> {
  if (!verify) {
    printLoginSuccessBanner();
    return;
  }

  const resolved = resolveConfig();
  await verifyCoreAuthEndpoint(resolved, verbose);
  if (verbose) {
    console.error("> Shared Core auth check passed");
  }
  printLoginSuccessBanner();
}

async function completePendingOAuthLogin(
  pending: PendingOAuthLogin,
  callbackToken: string,
  verify: boolean,
  verbose: boolean,
): Promise<void> {
  const code = parseAuthorizationCallbackCode(callbackToken, pending.state);
  if (verbose) {
    console.error("> authorization code provided; exchanging access token");
  }
  const token = await exchangeAuthorizationCode({
    tokenEndpoint: pending.tokenEndpoint,
    clientId: pending.clientId,
    clientSecret: pending.clientSecret,
    code,
    redirectUri: pending.redirectUri,
    codeVerifier: pending.codeVerifier,
    resource: pending.resource,
  });
  saveOAuthTokenConfig(
    pending.mcpURL,
    token,
    {
      tokenEndpoint: pending.tokenEndpoint,
      clientId: pending.clientId,
      clientSecret: pending.clientSecret,
      resource: pending.resource,
    },
    verbose,
  );
  clearPendingOAuthLogin();
  await verifySavedOAuthLogin(verify, verbose);
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
    .option("--callback-token <code-or-url>", "继续非阻塞登录：传入授权回调 code/token 或完整 callback URL")
    .option("--token <code-or-url>", "同 --callback-token，用于手动传入授权回调 code/token")
    .option("--no-open", "不自动打开浏览器，只打印授权 URL")
    .option("--no-block", "配合 --no-open：打印授权 URL 并保存 pending 状态后立即退出")
    .option("--no-verify", "保存 token 后跳过 shared core 鉴权校验")
    .action(async (opts: LoginOptions) => {
      const verbose = !!program.opts().verbose;
      const callbackToken = pickCallbackToken(opts);
      if (callbackToken) {
        const pending = loadPendingOAuthLogin();
        if (!pending) {
          throw new Error("未找到待完成的 OAuth 登录状态。请先运行 tyc login --no-open --no-block。");
        }
        if (verbose) {
          console.error(`> loaded pending OAuth login from ~/.tyc/oauth_pending.json (url=${pending.mcpURL})`);
        }
        await completePendingOAuthLogin(
          pending,
          callbackToken,
          opts.verify !== false && pending.verify !== false,
          verbose,
        );
        return;
      }

      const noBlock = opts.block === false;
      if (noBlock && opts.open !== false) {
        throw new Error("--no-block 需要与 --no-open 一起使用。");
      }

      const current = loadConfig() || {};
      const mcpURL = opts.url || process.env.TYC_MCP_ENDPOINT || current.url || DEFAULT_MCP_URL;
      const knownDefaults = knownOAuthDefaultsForMcpURL(mcpURL);
      let clientId = opts.clientId || process.env.TYC_OAUTH_CLIENT_ID || "";
      let clientSecret = opts.clientSecret || process.env.TYC_OAUTH_CLIENT_SECRET;
      const scope = opts.scope || "mcp:tools.call";
      const redirectHost = opts.redirectHost || "localhost";
      const redirectPort = parsePort(opts.redirectPort || "7078");
      const callbackPath = normalizeCallbackPath(opts.callbackPath);

      let issuer = opts.issuer || "";
      let resource = opts.resource || "";
      if (!opts.issuer || !opts.resource) {
        if (verbose) {
          console.error(`> discovering MCP OAuth metadata: ${mcpURL}`);
        }
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
      let callback: CallbackServer | undefined;
      const redirectUri = noBlock
        ? buildLoopbackRedirectUri(redirectHost, redirectPort, callbackPath)
        : (callback = await startCallbackServer({
            host: redirectHost,
            port: redirectPort,
            path: callbackPath,
            state,
            timeoutMs: 5 * 60 * 1000,
          })).redirectUri;
      if (!clientId) {
        if (!endpoints.registrationEndpoint) {
          callback?.close();
          throw new Error(
            "OAuth metadata 未提供 registration_endpoint，请用 --client-id 指定预注册客户端。",
          );
        }
        if (verbose) {
          console.error("> registering OAuth client via Dynamic Client Registration");
        }
        let registeredClient: Awaited<ReturnType<typeof registerDynamicOAuthClient>>;
        try {
          registeredClient = await registerDynamicOAuthClient({
            registrationEndpoint: endpoints.registrationEndpoint,
            clientName: "tyc-cli",
            redirectUris: [redirectUri],
            tokenEndpointAuthMethod: "none",
          });
        } catch (err) {
          callback?.close();
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
        redirectUri,
        scope,
        state,
        codeChallenge: pkce.codeChallenge,
        resource,
      });

      if (verbose) {
        console.error(`> OAuth callback: ${redirectUri}`);
      }
      if (noBlock) {
        savePendingOAuthLogin({
          version: 1,
          createdAt: Date.now(),
          mcpURL,
          tokenEndpoint: endpoints.tokenEndpoint,
          clientId,
          clientSecret,
          redirectUri,
          codeVerifier: pkce.codeVerifier,
          resource,
          state,
          verify: opts.verify !== false,
        });
        console.error("请在浏览器打开以下 URL 完成登录：");
        console.error(authorizationURL);
        console.error("");
        console.error("完成授权后，复制回调 URL 中的 code/token 参数，然后运行：");
        console.error("tyc login --callback-token <code_or_token>");
        console.error("也可以传完整 callback URL：tyc login --callback-token \"http://localhost:7078/oauth/callback?code=...&state=...\"");
        return;
      }

      if (opts.open === false) {
        console.error("请在浏览器打开以下 URL 完成登录：");
        console.error(authorizationURL);
      } else {
        console.error("正在打开浏览器完成 OAuth 登录...");
        openBrowser(authorizationURL);
      }

      if (!callback) {
        throw new Error("OAuth callback server not initialized");
      }
      const code = await callback.waitForCode();
      if (verbose) {
        console.error("> authorization code received; exchanging access token");
      }
      const token = await exchangeAuthorizationCode({
        tokenEndpoint: endpoints.tokenEndpoint,
        clientId,
        clientSecret,
        code,
        redirectUri,
        codeVerifier: pkce.codeVerifier,
        resource,
      });

      saveOAuthTokenConfig(
        mcpURL,
        token,
        {
          tokenEndpoint: endpoints.tokenEndpoint,
          clientId,
          clientSecret,
          resource,
        },
        verbose,
      );
      clearPendingOAuthLogin();
      await verifySavedOAuthLogin(opts.verify !== false, verbose);
    });
}
