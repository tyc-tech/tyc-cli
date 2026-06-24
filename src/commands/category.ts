// 动态注册：按 catalog.json 生成 `tyc <group> <method>` 命令
//
// 每个方法的 handler 只负责：
//   1. 组装 arguments 映射
//   2. 调 shared core tools/call → MCP Server
//   3. 从 result.content[0].text 解出业务 JSON（已是服务端合并/格式化后的成品）
//   4. 按 --md / --compact / --pretty / 默认 输出，再过 --head/--tail/--full
//      /--threshold/--output-file 截断 & 落盘
import type { Command } from "commander";
import { getCategories, getToolsByGroup } from "../registry.js";
import type { CatalogTool, McpToolCallResult } from "../types.js";
import { registerCompanyCapabilitiesCommand } from "./capabilities.js";
import { callCoreToolWithOAuthRefresh } from "./coreCall.js";
import { emitToolResult } from "./output.js";

const GLOBAL_OUTPUT_HELP = `
全局输出选项：所有工具命令均支持 --md / --compact / --pretty / --head / --tail / --full / --threshold / --output-file / --verbose；完整说明见 tyc --help。
`;

export function registerCategoryCommands(program: Command): void {
  for (const cat of getCategories()) {
    const tools = getToolsByGroup(cat.group);
    const layerCounts = countLayers(tools);
    const catCmd = program
      .command(cat.group)
      .description(
        `${cat.name_zh}（${cat.tool_count} 个 · L0=${layerCounts.L0} L1=${layerCounts.L1} L2=${layerCounts.L2} L3=${layerCounts.L3}）`
      );

    if (cat.group === "company") {
      registerCompanyCapabilitiesCommand(catCmd, program);
    }

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
    methodCmd = methodCmd.requiredOption(
      `--${p.name} <value>`,
      `必填；${p.description}`,
    );
  }
  for (const p of optionalParams) {
    methodCmd = methodCmd.option(`--${p.name} <value>`, p.description);
  }

  methodCmd.addHelpText("after", GLOBAL_OUTPUT_HELP);

  methodCmd.action(async (posVal: string | undefined, options: Record<string, string>) => {
    const args: Record<string, string> = {};
    if (positional && posVal) args[positional.name] = posVal;
    for (const p of [...remainingRequired, ...optionalParams]) {
      if (options[p.name] !== undefined) args[p.name] = options[p.name];
    }

    const opts = program.opts();
    const verbose = !!opts.verbose;

    try {
      const result = await callToolWithOAuthRefresh(tool.name, args, verbose);
      emitToolResult(result, opts, tool.name);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`请求失败: ${msg}`);
      process.exit(1);
    }
  });
}

async function callToolWithOAuthRefresh(
  name: string,
  args: Record<string, unknown>,
  verbose: boolean,
): Promise<McpToolCallResult> {
  return callCoreToolWithOAuthRefresh(name, args, { verbose });
}
