import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildCliCallbackRedirectUri,
  exchangeDeviceCode,
  exchangeRefreshToken,
  knownOAuthDefaultsForMcpURL,
  OAuthTokenEndpointError,
  parseAuthorizationCallbackCode,
  requestDeviceAuthorization,
} from "./oauth.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("knownOAuthDefaultsForMcpURL", () => {
  it("keeps the resource aligned with the configured MCP endpoint path", () => {
    expect(knownOAuthDefaultsForMcpURL("https://ai-mcp-pre.tianyancha.com/v1")).toMatchObject({
      issuer: "https://ai-pre.tianyancha.com/oauth",
      resource: "https://ai-mcp-pre.tianyancha.com/v1",
    });
    expect(knownOAuthDefaultsForMcpURL("https://mcp.tianyancha.com/v1")).toMatchObject({
      issuer: "https://ai.tianyancha.com/oauth",
      resource: "https://mcp.tianyancha.com/v1",
    });
    expect(knownOAuthDefaultsForMcpURL("https://mcp.tianyancha.com/mcp")).toMatchObject({
      issuer: "https://ai.tianyancha.com/oauth",
      resource: "https://mcp.tianyancha.com/mcp",
    });
  });
});

describe("buildCliCallbackRedirectUri", () => {
  it("derives the CLI callback page from the authorization issuer", () => {
    expect(buildCliCallbackRedirectUri("https://ai.tianyancha.com/oauth")).toBe(
      "https://ai.tianyancha.com/oauth/cli/callback",
    );
    expect(buildCliCallbackRedirectUri("https://ai-pre.tianyancha.com/oauth/")).toBe(
      "https://ai-pre.tianyancha.com/oauth/cli/callback",
    );
  });
});

describe("parseAuthorizationCallbackCode", () => {
  it("accepts a raw callback code", () => {
    expect(parseAuthorizationCallbackCode(" callback-code ")).toBe("callback-code");
  });

  it("extracts code from a full callback URL and verifies state when present", () => {
    expect(
      parseAuthorizationCallbackCode(
        "http://localhost:7078/oauth/callback?code=abc123&state=state-1",
        "state-1",
      ),
    ).toBe("abc123");
  });

  it("extracts code from a callback query string", () => {
    expect(parseAuthorizationCallbackCode("?code=abc123&state=state-1", "state-1")).toBe(
      "abc123",
    );
  });

  it("rejects token-style callback parameter aliases", () => {
    expect(() =>
      parseAuthorizationCallbackCode("?token=abc123&state=state-1", "state-1"),
    ).toThrow("callback URL missing code");
    expect(
      () => parseAuthorizationCallbackCode("?callback_token=def456&state=state-1", "state-1"),
    ).toThrow("callback URL missing code");
  });

  it("rejects a callback URL with mismatched state", () => {
    expect(() =>
      parseAuthorizationCallbackCode(
        "http://localhost:7078/oauth/callback?code=abc123&state=wrong",
        "state-1",
      ),
    ).toThrow("OAuth state mismatch");
  });

  it("surfaces OAuth callback errors", () => {
    expect(() =>
      parseAuthorizationCallbackCode(
        "http://localhost:7078/oauth/callback?error=access_denied&error_description=nope",
        "state-1",
      ),
    ).toThrow("OAuth error: nope");
  });
});

describe("exchangeRefreshToken", () => {
  it("uses the OAuth refresh_token grant", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            access_token: "new-access-token",
            token_type: "Bearer",
            expires_in: 900,
            refresh_token: "new-refresh-token",
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const token = await exchangeRefreshToken({
      tokenEndpoint: "https://issuer.example/oauth/token",
      clientId: "client-1",
      clientSecret: "secret-1",
      refreshToken: "old-refresh-token",
      resource: "https://mcp.example/mcp",
    });

    expect(token.access_token).toBe("new-access-token");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://issuer.example/oauth/token");
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    const body = init.body as URLSearchParams;
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("client_id")).toBe("client-1");
    expect(body.get("client_secret")).toBe("secret-1");
    expect(body.get("refresh_token")).toBe("old-refresh-token");
    expect(body.get("resource")).toBe("https://mcp.example/mcp");
  });
});

describe("requestDeviceAuthorization", () => {
  it("requests an OAuth device authorization", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            device_code: "device-secret",
            user_code: "123456",
            verification_uri: "https://issuer.example/oauth/device",
            expires_in: 600,
            interval: 5,
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const device = await requestDeviceAuthorization({
      deviceAuthorizationEndpoint: "https://issuer.example/oauth/device_authorization",
      clientId: "client-1",
      scope: "mcp:tools.call",
      resource: "https://mcp.example/mcp",
    });

    expect(device.user_code).toBe("123456");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const body = init.body as URLSearchParams;
    expect(body.get("client_id")).toBe("client-1");
    expect(body.get("scope")).toBe("mcp:tools.call");
    expect(body.get("resource")).toBe("https://mcp.example/mcp");
  });
});

describe("exchangeDeviceCode", () => {
  it("uses the RFC 8628 device_code grant", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            access_token: "access-token",
            token_type: "Bearer",
            expires_in: 900,
            refresh_token: "refresh-token",
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const token = await exchangeDeviceCode({
      tokenEndpoint: "https://issuer.example/oauth/token",
      clientId: "client-1",
      deviceCode: "device-secret",
      resource: "https://mcp.example/mcp",
    });

    expect(token.access_token).toBe("access-token");
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const body = init.body as URLSearchParams;
    expect(body.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:device_code");
    expect(body.get("device_code")).toBe("device-secret");
  });

  it("surfaces OAuth device polling errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: "authorization_pending" }), { status: 400 }),
      ),
    );

    await expect(
      exchangeDeviceCode({
        tokenEndpoint: "https://issuer.example/oauth/token",
        clientId: "client-1",
        deviceCode: "device-secret",
      }),
    ).rejects.toMatchObject({
      error: "authorization_pending",
    } satisfies Partial<OAuthTokenEndpointError>);
  });
});
