// T1 与 T1.1 复用同一个底层 tyc OpenAPI HTTP 客户端逻辑。
const DOMAIN = "https://open.api.tianyancha.com";
const BASE_PATH = "/services/open";

export interface CallApiOptions {
  verbose?: boolean;
}

export interface TycResponse {
  result?: unknown;
  reason?: string;
  error_code?: number;
}

export async function callApi(
  path: string,
  params: Record<string, string>,
  authorization: string,
  options?: CallApiOptions
): Promise<TycResponse> {
  let base: string;
  if (path.startsWith("/")) {
    base = DOMAIN + path;
  } else {
    base = DOMAIN + BASE_PATH + "/" + path;
  }

  const qs = new URLSearchParams(params).toString();
  const url = qs ? `${base}?${qs}` : base;

  const headers: Record<string, string> = { Authorization: authorization };

  if (options?.verbose) {
    console.error(`> GET ${url}`);
    console.error(`> Authorization: ${maskToken(authorization)}`);
  }

  const resp = await fetch(url, { method: "GET", headers });
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
  }
  return (await resp.json()) as TycResponse;
}

function maskToken(token: string): string {
  if (token.length <= 8) return "****";
  return token.slice(0, 4) + "****" + token.slice(-4);
}
