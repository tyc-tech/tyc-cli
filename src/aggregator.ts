// Aggregator (TS 版本)
// 对齐 tools/t1_1/aggregator/aggregator.go 的语义：
//  - parallel: 并发调用全部 sources，required 失败抛错，非 required 失败记 warnings
//  - serial:   前一步结果注入后一步 params 上下文（{{.scope.result.path}}）
//  - condition: Go text/template 风格；当前仅支持 {{ne .X ""}} 形式（足够覆盖 registry）
//  - params_template: 字符串模板求值，空值不传

import type { Tool, Source } from "./types.js";
import { callApi } from "./client.js";

export type SourceResult = Record<string, unknown>;
export type AggResult = Record<string, SourceResult>; // scope → result map
export type Warnings = Record<string, string>;

export interface RunOptions {
  verbose?: boolean;
}

/** 简化版 Go text/template 字符串求值：
 *  支持 `{{.X}}` 和嵌套 `{{.a.b.c}}`；未匹配字段返回空串。
 */
export function renderString(tpl: string, ctx: Record<string, unknown>): string {
  return tpl.replace(/\{\{\s*\.([\w.[\]0-9]+)\s*\}\}/g, (_m, path: string) => {
    const v = getPath(ctx, path);
    return v === undefined || v === null ? "" : String(v);
  });
}

/** condition 求值：只支持 `{{ne .X ""}}` 的简化语法 → true/false */
export function evalCondition(cond: string, ctx: Record<string, unknown>): boolean {
  if (!cond) return true;
  const m = cond.match(/\{\{\s*ne\s+\.(\S+)\s+"([^"]*)"\s*\}\}/);
  if (m) {
    const v = getPath(ctx, m[1]);
    return String(v ?? "") !== m[2];
  }
  // 其他未识别条件保守放行
  return true;
}

function getPath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(/[.[\]]+/).filter(Boolean);
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur === null || cur === undefined) return undefined;
    if (Array.isArray(cur)) {
      const i = Number(p);
      if (Number.isNaN(i)) return undefined;
      cur = cur[i];
    } else if (typeof cur === "object") {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return undefined;
    }
  }
  return cur;
}

function renderParams(tpl: Record<string, string> | undefined, ctx: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  if (!tpl) return out;
  for (const [k, v] of Object.entries(tpl)) {
    const s = renderString(v, ctx);
    if (s !== "") out[k] = s;
  }
  return out;
}

async function callSource(
  src: Source,
  ctx: Record<string, unknown>,
  auth: string,
  verbose: boolean
): Promise<SourceResult | null> {
  const params = renderParams(src.params_template, ctx);
  const resp = await callApi(src.path, params, auth, { verbose });
  // tyc 错误码语义归一化：
  //   0       = 成功
  //   300000  = 经查无结果 → 业务空结果，返回 {}（不报错）
  //   其他非 0 = 真实错误 → 抛错
  if (resp.error_code === 300000) {
    // 归一化为列表类空结果，便于 transformer 注入 _empty/_summary
    return { items: [], total: 0 };
  }
  if (resp.error_code && resp.error_code !== 0) {
    throw new Error(`OpenAPI ${resp.error_code}: ${resp.reason ?? ""}`);
  }
  const result = resp.result;
  if (result === null || result === undefined) return {};
  if (typeof result === "object" && !Array.isArray(result)) {
    return result as SourceResult;
  }
  if (Array.isArray(result)) {
    return { items: result, total: result.length };
  }
  return { _raw: result };
}

export async function runTool(tool: Tool, args: Record<string, string>, auth: string, opts?: RunOptions): Promise<{ results: AggResult; warnings: Warnings }> {
  const verbose = !!opts?.verbose;
  const exec = tool.execution || "parallel";
  if (exec === "serial") {
    return runSerial(tool, args, auth, verbose);
  }
  return runParallel(tool, args, auth, verbose);
}

async function runParallel(
  tool: Tool,
  args: Record<string, string>,
  auth: string,
  verbose: boolean
): Promise<{ results: AggResult; warnings: Warnings }> {
  const ctx = { ...args };
  const results: AggResult = {};
  const warnings: Warnings = {};
  await Promise.all(
    tool.sources.map(async (src) => {
      try {
        if (!evalCondition(src.condition || "", ctx)) return;
        const r = await callSource(src, ctx, auth, verbose);
        if (r !== null) results[src.scope] = r;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (src.required) throw new Error(`required source ${src.path} failed: ${msg}`);
        warnings[src.path] = msg;
      }
    })
  );
  return { results, warnings };
}

async function runSerial(
  tool: Tool,
  args: Record<string, string>,
  auth: string,
  verbose: boolean
): Promise<{ results: AggResult; warnings: Warnings }> {
  const ctx: Record<string, unknown> = { ...args };
  const results: AggResult = {};
  const warnings: Warnings = {};
  for (const src of tool.sources) {
    try {
      if (!evalCondition(src.condition || "", ctx)) continue;
      const r = await callSource(src, ctx, auth, verbose);
      if (r !== null) {
        results[src.scope] = r;
        ctx[src.scope] = { result: r };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (src.required) throw new Error(`required source ${src.path} failed: ${msg}`);
      warnings[src.path] = msg;
    }
  }
  return { results, warnings };
}
