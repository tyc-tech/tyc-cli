#!/usr/bin/env node
import { Command } from "commander";
import { registerInitCommand } from "./commands/init.js";
import { registerCategoryCommands } from "./commands/category.js";
import { getTotalCount, getCategories } from "./registry.js";

const program = new Command()
  .name("tyc")
  .description(
    `天眼查 CLI — ${getTotalCount()} 个业务语义聚合工具 · ${getCategories().length} 个分类 · 返回 tyc 英文 key 透传结构`
  )
  .version("0.1.0")
  .option("--pretty", "格式化 JSON 输出（缩进 2 空格）")
  .option("--md", "Markdown 表格化输出（适合人类阅读 / Agent 上屏）")
  .option("--verbose", "输出请求详情到 stderr");

registerInitCommand(program);
registerCategoryCommands(program);

program.parseAsync(process.argv).catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(msg);
  process.exit(1);
});
