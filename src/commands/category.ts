import type { Command } from "commander";
import { getCategories, getToolsByGroup } from "../registry.js";
import { getAuthorization } from "../config.js";
import { runTool } from "../aggregator.js";
import { applyTransformer } from "../transformer.js";

// T1.1 动态注册：按 api-registry.yaml 生成 `tyc <group> <method>` 命令。
export function registerCategoryCommands(program: Command): void {
  const categories = getCategories();

  for (const cat of categories) {
    const catCmd = program
      .command(cat.group)
      .description(`${cat.name_zh}（${cat.tool_count} 个工具）`);

    const tools = getToolsByGroup(cat.group);
    for (const tool of tools) {
      const params = tool.params || [];
      const requiredParams = params.filter((p) => p.required);
      const optionalParams = params.filter((p) => !p.required);
      // 第一个必填参数作为位置参数
      const positional = requiredParams[0] || null;
      const remainingRequired = requiredParams.slice(1);

      let methodCmd = catCmd
        .command(tool.cliMethod)
        .description(tool.description);

      if (positional) {
        methodCmd = methodCmd.argument(`<${positional.name}>`, positional.description);
      }
      for (const p of remainingRequired) {
        methodCmd = methodCmd.requiredOption(`--${p.name} <value>`, p.description);
      }
      for (const p of optionalParams) {
        methodCmd = methodCmd.option(`--${p.name} <value>`, p.description);
      }

      const bound = tool;
      methodCmd.action(async (posVal: string | undefined, options: Record<string, string>) => {
        const auth = getAuthorization();
        const args: Record<string, string> = {};
        if (positional && posVal) args[positional.name] = posVal;
        for (const p of [...remainingRequired, ...optionalParams]) {
          if (options[p.name] !== undefined) args[p.name] = options[p.name];
        }
        try {
          const { results, warnings } = await runTool(bound, args, auth, {
            verbose: !!program.opts().verbose,
          });
          const out = applyTransformer(bound, results, warnings);
          const text = program.opts().pretty
            ? JSON.stringify(out, null, 2)
            : JSON.stringify(out);
          console.log(text);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`请求失败: ${msg}`);
          process.exit(1);
        }
      });
    }
  }
}
