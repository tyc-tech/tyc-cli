import type { Command } from "commander";
import { saveConfig, loadConfig } from "../config.js";

export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .description("配置 Authorization（保存到 ~/.tyc/config.json）")
    .option("--authorization <token>", "tyc OpenAPI Authorization")
    .action((opts: { authorization?: string }) => {
      const existing = loadConfig() || {};
      if (opts.authorization) existing.authorization = opts.authorization;
      saveConfig(existing);
      console.log("已保存到 ~/.tyc/config.json");
    });
}
