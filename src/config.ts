import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { TycConfig } from "./types.js";

// T1 与 T1.1 共享配置文件 ~/.tyc/config.json
const CONFIG_DIR = join(homedir(), ".tyc");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

export function loadConfig(): TycConfig | null {
  if (!existsSync(CONFIG_FILE)) return null;
  const raw = readFileSync(CONFIG_FILE, "utf-8");
  return JSON.parse(raw) as TycConfig;
}

export function saveConfig(config: TycConfig): void {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

export function getAuthorization(): string {
  const cfg = loadConfig();
  if (!cfg?.authorization) {
    console.error(
      "未配置 Authorization。请先运行：tyc init --authorization YOUR_API_KEY"
    );
    process.exit(1);
  }
  return cfg.authorization;
}
