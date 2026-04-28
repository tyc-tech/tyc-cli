// 动态注册：按 catalog.json 生成 `tyc <group> <method>` 命令
//
// 每个方法的 handler 只负责：
//   1. 组装 arguments 映射
//   2. 调 mcpClient.callTool → MCP Server
//   3. 从 result.content[0].text 解出业务 JSON（已是服务端合并/格式化后的成品）
//   4. 按 --md / --pretty / 默认 输出到 stdout
import type { Command } from "commander";
import { getCategories, getToolsByGroup } from "../registry.js";
import { resolveConfig } from "../config.js";
import { callTool } from "../mcpClient.js";
import { jsonToMarkdown } from "../utils/jsonToMarkdown.js";
import type { CatalogTool, McpToolCallResult } from "../types.js";

export function registerCategoryCommands(program: Command): void {
  for (const cat of getCategories()) {
    const tools = getToolsByGroup(cat.group);
    const layerCounts = countLayers(tools);
    const catCmd = program
      .command(cat.group)
      .description(
        `${cat.name_zh}（${cat.tool_count} 个 · L0=${layerCounts.L0} L1=${layerCounts.L1} L2=${layerCounts.L2} L3=${layerCounts.L3}）`
      );

    for (const tool of tools) {
      bindMethod(catCmd, tool, program);
    }
  }
}

function countLayers(
  tools: CatalogTool[]
): Record<"L0" | "L1" | "L2" | "L3", number> {
  const c = { L0: 0, L1: 0, L2: 0, L3: 0 };
  for (const t of tools) c[t.layer] += 1;
  return c;
}

function bindMethod(catCmd: Command, tool: CatalogTool, program: Command): void {
  const params = tool.params || [];
  const requiredParams = params.filter((p) => p.required);
  const optionalParams = params.filter((p) => !p.required);
  const positional = requiredParams[0] || null;
  const remainingRequired = requiredParams.slice(1);

  // 在描述首部打上 [LX] 徽章，让 `tyc <group> --help` / `tyc <group> <method> --help`
  // 都能直观看到分层信息；徽章不影响 Agent 对 description 的语义理解。
  let methodCmd = catCmd
    .command(tool.cliMethod)
    .description(`[${tool.layer}] ${tool.description}`);

  if (positional) {
    methodCmd = methodCmd.argument(`<${positional.name}>`, positional.description);
  }
  for (const p of remainingRequired) {
    methodCmd = methodCmd.requiredOption(`--${p.name} <value>`, p.description);
  }
  for (const p of optionalParams) {
    methodCmd = methodCmd.option(`--${p.name} <value>`, p.description);
  }

  methodCmd.action(async (posVal: string | undefined, options: Record<string, string>) => {
    const args: Record<string, string> = {};
    if (positional && posVal) args[positional.name] = posVal;
    for (const p of [...remainingRequired, ...optionalParams]) {
      if (options[p.name] !== undefined) args[p.name] = options[p.name];
    }

    const cfg = resolveConfig();
    const opts = program.opts();
    const verbose = !!opts.verbose;

    try {
      const result = await callTool(cfg, tool.name, args, { verbose });
      emit(result, opts, tool.name);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`请求失败: ${msg}`);
      process.exit(1);
    }
  });
}

function emit(
  result: McpToolCallResult,
  opts: Record<string, unknown>,
  toolName: string
): void {
  // MCP 业务错误：isError + content[0].text = 错误描述
  if (result.isError) {
    const errText = extractText(result) || "未知业务错误";
    console.error(errText);
    process.exit(1);
  }

  const text = extractText(result);
  if (text === null) {
    console.error("tools/call 返回无可解析内容");
    process.exit(1);
  }

  // MCP Server 返回的是 JSON 字符串（已完成多源合并 / 时间戳格式化 /
  // _summary / _empty / _warnings 注入）。CLI 只做呈现格式化。
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    // 非 JSON 文本：直接原样输出
    process.stdout.write(text.endsWith("\n") ? text : text + "\n");
    return;
  }

  let rendered: string;
  if (opts.md) {
    rendered = jsonToMarkdown(payload as Record<string, unknown>, toolName);
  } else if (opts.pretty) {
    rendered = JSON.stringify(payload, null, 2);
  } else {
    rendered = JSON.stringify(payload);
  }
  console.log(rendered);
}

function extractText(result: McpToolCallResult): string | null {
  const content = result.content || [];
  for (const c of content) {
    if (typeof c.text === "string" && c.text.length > 0) return c.text;
  }
  return null;
}
