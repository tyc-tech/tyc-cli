import type { Command } from "commander";
import { callCoreToolWithOAuthRefresh } from "./coreCall.js";
import { emitToolResult } from "./output.js";

const TOOL_NAME = "get_company_capabilities";

export function registerCompanyCapabilitiesCommand(
  companyCmd: Command,
  program: Command,
): void {
  companyCmd
    .command("capabilities")
    .description(
      "[DISCOVER] 输入 search_companies 候选表 company_id，返回该企业可直接执行的 tyc CLI 工具清单",
    )
    .argument("<company_id>", "search_companies 候选表 items[*].id 中的数字企业 ID")
    .option("--company-name <value>", "企业名称（可选，仅用于展示和后续主体参数示例）")
    .action(async (companyID: string, options: { companyName?: string }) => {
      const args: Record<string, string> = {
        company_id: companyID,
      };
      if (options.companyName !== undefined) {
        args.company_name = options.companyName;
      }

      const opts = program.opts();
      const verbose = !!opts.verbose;

      try {
        const result = await callCoreToolWithOAuthRefresh(TOOL_NAME, args, {
          verbose,
          format: "markdown",
        });
        emitToolResult(result, opts, TOOL_NAME);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`请求失败: ${msg}`);
        process.exit(1);
      }
    });
}
