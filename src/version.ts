// CLI 版本号单一来源：从 package.json 读取
//
// 历史上 index.ts 与 mcpClient.ts 各自硬编码版本字符串，多处漂移。
// 收敛到 package.json 一处后，bump 版本只需 npm version <x>。
// 运行时 fs 读：dev (`tsx src/version.ts`) 与 dist (`dist/version.js`) 与
// package.json 都同级 (cli/t1_1/{src,dist} ↔ cli/t1_1/package.json)，
// resolve(__dirname, "..", "package.json") 在两种场景下都指向同一文件。
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_PATH = resolve(__dirname, "..", "package.json");

function readVersion(): string {
  try {
    const raw = readFileSync(PKG_PATH, "utf-8");
    return (JSON.parse(raw) as { version?: string }).version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export const VERSION = readVersion();
