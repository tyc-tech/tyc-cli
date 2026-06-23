import {
  refreshResolvedConfigOAuth,
  resolveConfigWithFreshOAuth,
} from "../config.js";
import { callCoreTool, type CoreCallOptions } from "../coreClient.js";
import type { McpToolCallResult } from "../types.js";

function isUnauthorizedError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /\bHTTP 401\b/i.test(msg) || /invalid_token|expired_token|token expired/i.test(msg);
}

export async function callCoreToolWithOAuthRefresh(
  name: string,
  args: Record<string, unknown>,
  opts?: CoreCallOptions,
): Promise<McpToolCallResult> {
  let refreshResult = await resolveConfigWithFreshOAuth({ verbose: !!opts?.verbose });
  try {
    return await callCoreTool(refreshResult.config, name, args, opts);
  } catch (err) {
    if (!isUnauthorizedError(err)) throw err;
    refreshResult = await refreshResolvedConfigOAuth(refreshResult.config, {
      force: true,
      verbose: !!opts?.verbose,
    });
    if (!refreshResult.refreshed) throw err;
    return callCoreTool(refreshResult.config, name, args, opts);
  }
}
