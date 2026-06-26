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
  buildCliCallbackRedirectUri,
  type CallbackServer,
  createPKCE,
  DEVICE_CODE_GRANT_TYPE,
  discoverAuthorizationServer,
  discoverProtectedResourceMetadata,
  exchangeAuthorizationCode,
  exchangeDeviceCode,
  knownOAuthDefaultsForMcpURL,
  OAuthTokenEndpointError,
  openBrowser,
  parseAuthorizationCallbackCode,
  randomState,
  registerDynamicOAuthClient,
  requestDeviceAuthorization,
  startCallbackServer,
  type OAuthEndpoints,
  type OAuthTokenResponse,
} from "../oauth.js";
import {
  clearPendingOAuthLogin,
  loadPendingOAuthLogin,
  savePendingOAuthLogin,
  type PendingOAuthDeviceLogin,
  type PendingOAuthLogin,
  type PendingOAuthPKCELogin,
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
  resume?: boolean;
  open?: boolean;
  block?: boolean;
  verify?: boolean;
  deviceAuthorizationEndpoint?: string;
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

function pickCallbackToken(opts: LoginOptions): string | undefined {
  if (opts.callbackToken && opts.token) {
    throw new Error("--callback-token 和 --token 只能指定一个。");
  }
  return opts.callbackToken || opts.token;
}

function saveOAuthTokenConfig(
  mcpURL: string,
  token: OAuthTokenResponse,
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

function isPendingDeviceLogin(pending: PendingOAuthLogin): pending is PendingOAuthDeviceLogin {
  return pending.version === 2;
}

function isPendingPKCELogin(pending: PendingOAuthLogin): pending is PendingOAuthPKCELogin {
  return pending.version === 1;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function completePendingOAuthLogin(
  pending: PendingOAuthPKCELogin,
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
  clearPendingOAuthLogin(verbose);
  await verifySavedOAuthLogin(verify, verbose);
}

async function completePendingDeviceLogin(
  pending: PendingOAuthDeviceLogin,
  verify: boolean,
  verbose: boolean,
): Promise<void> {
  if (pending.expiresAt <= Date.now()) {
    clearPendingOAuthLogin(verbose);
    throw new Error("OAuth device 授权已过期，请重新运行 tyc login --no-block。");
  }

  let intervalMs = Math.max(1, pending.interval || 5) * 1000;
  const deadline = Date.now() + 30_000;
  for (;;) {
    try {
      if (verbose) {
        console.error("> polling OAuth device token endpoint");
      }
      const token = await exchangeDeviceCode({
        tokenEndpoint: pending.tokenEndpoint,
        clientId: pending.clientId,
        clientSecret: pending.clientSecret,
        deviceCode: pending.deviceCode,
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
          scope: pending.scope,
        },
        verbose,
      );
      clearPendingOAuthLogin(verbose);
      await verifySavedOAuthLogin(verify, verbose);
      return;
    } catch (err) {
      if (!(err instanceof OAuthTokenEndpointError)) {
        throw err;
      }
      if (err.error === "authorization_pending" || err.error === "slow_down") {
        if (err.error === "slow_down") {
          intervalMs += 5_000;
        }
        if (Date.now() + intervalMs > deadline) {
          throw new Error("授权尚未完成。请在网页输入 6 位验证码并确认后，再运行 tyc login --resume。");
        }
        await sleep(intervalMs);
        continue;
      }
      if (["expired_token", "access_denied", "invalid_grant"].includes(err.error)) {
        clearPendingOAuthLogin(verbose);
      }
      if (err.error === "expired_token") {
        throw new Error("OAuth device 授权已过期，请重新运行 tyc login --no-block。");
      }
      if (err.error === "access_denied") {
        throw new Error("OAuth device 授权已被拒绝，请重新运行 tyc login --no-block。");
      }
      throw err;
    }
  }
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
    .option("--device-authorization-endpoint <url>", "手动指定 OAuth device authorization endpoint")
    .option("--redirect-host <host>", "本地回调 host（默认 localhost）")
    .option("--redirect-port <port>", "本地回调端口（默认 7078）")
    .option("--callback-path <path>", "本地回调路径（默认 /oauth/callback）")
    .option("--callback-token <code-or-url>", "继续非阻塞登录：传入授权回调 code 或包含 code 的完整 callback URL")
    .option("--token <code-or-url>", "同 --callback-token（兼容别名；仍需传授权回调 code）")
    .option("--resume", "继续 RFC 8628 device flow 非阻塞登录")
    .option("--no-open", "不自动打开浏览器，只打印授权 URL")
    .option("--no-block", "打印 Device Flow 授权 URL 和 6 位验证码并保存 pending 状态后立即退出")
    .option("--no-verify", "保存 token 后跳过 shared core 鉴权校验")
    .action(async (opts: LoginOptions) => {
      const verbose = !!program.opts().verbose;
      const callbackToken = pickCallbackToken(opts);
      if (opts.resume) {
        if (callbackToken) {
          throw new Error("--resume 不能与 --callback-token/--token 同时使用。");
        }
        const pending = loadPendingOAuthLogin();
        if (!pending) {
          throw new Error("未找到待完成的 OAuth device 登录状态。请先运行 tyc login --no-block。");
        }
        if (!isPendingDeviceLogin(pending)) {
          throw new Error("当前待完成的是旧版 callback 登录，请使用 tyc login --callback-token <code-or-url>。");
        }
        await completePendingDeviceLogin(
          pending,
          opts.verify !== false && pending.verify !== false,
          verbose,
        );
        return;
      }
      if (callbackToken) {
        const pending = loadPendingOAuthLogin();
        if (!pending) {
          throw new Error("未找到待完成的 OAuth 登录状态。请先运行 tyc login --no-block。");
        }
        if (!isPendingPKCELogin(pending)) {
          throw new Error("当前待完成的是 device 登录，请在网页确认后运行 tyc login --resume。");
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
          deviceAuthorizationEndpoint: opts.deviceAuthorizationEndpoint,
          issuer,
        };
      } else {
        endpoints = await discoverAuthorizationServer(issuer);
        endpoints.authorizationEndpoint =
          opts.authorizationEndpoint || endpoints.authorizationEndpoint;
        endpoints.tokenEndpoint = opts.tokenEndpoint || endpoints.tokenEndpoint;
        endpoints.deviceAuthorizationEndpoint =
          opts.deviceAuthorizationEndpoint || endpoints.deviceAuthorizationEndpoint;
      }
      resource ||= endpoints.resourceDocumentation || mcpURL;
      if (verbose) {
        console.error(`> authorization endpoint: ${endpoints.authorizationEndpoint}`);
        console.error(`> token endpoint: ${endpoints.tokenEndpoint}`);
        if (endpoints.deviceAuthorizationEndpoint) {
          console.error(`> device authorization endpoint: ${endpoints.deviceAuthorizationEndpoint}`);
        }
        if (endpoints.registrationEndpoint) {
          console.error(`> registration endpoint: ${endpoints.registrationEndpoint}`);
        }
      }

      const state = randomState();
      const pkce = createPKCE();
      let callback: CallbackServer | undefined;
      const redirectUri = noBlock
        ? buildCliCallbackRedirectUri(issuer)
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
            grantTypes: noBlock
              ? ["authorization_code", "refresh_token", DEVICE_CODE_GRANT_TYPE]
              : undefined,
            responseTypes: ["code"],
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
      if (noBlock) {
        if (!endpoints.deviceAuthorizationEndpoint) {
          throw new Error("OAuth metadata 未提供 device_authorization_endpoint，请升级授权服务或使用 --device-authorization-endpoint 指定。");
        }
        const device = await requestDeviceAuthorization({
          deviceAuthorizationEndpoint: endpoints.deviceAuthorizationEndpoint,
          clientId,
          clientSecret,
          scope,
          resource,
        });
        savePendingOAuthLogin({
          version: 2,
          flow: "device",
          createdAt: Date.now(),
          mcpURL,
          tokenEndpoint: endpoints.tokenEndpoint,
          clientId,
          clientSecret,
          deviceCode: device.device_code,
          userCode: device.user_code,
          verificationUri: device.verification_uri,
          expiresAt: Date.now() + device.expires_in * 1000,
          interval: device.interval || 5,
          resource,
          scope,
          verify: opts.verify !== false,
        });
        console.error("请在浏览器打开以下 URL 完成登录：");
        console.error(device.verification_uri);
        console.error("");
        console.error(`验证码：${device.user_code}`);
        console.error("");
        console.error("在网页输入 6 位验证码并确认授权后，运行：");
        console.error("tyc login --resume");
        return;
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
      clearPendingOAuthLogin(verbose);
      await verifySavedOAuthLogin(opts.verify !== false, verbose);
    });
}
