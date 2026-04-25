/**
 * build-registry.ts
 *
 * 读 ../api-registry.yaml（仓库自带 SSOT 副本）生成 src/generated/t1_1-registry.json。
 * 为每个 tool 计算 cliMethod（kebab-case，自动剥离分类前缀），校验无命名冲突。
 *
 * 注：此 yaml 是 apimcp monorepo 中 conf/api-registry.yaml 的 vendored 副本，
 *    便于本仓库独立构建与发布到 npm。同步规则见 README.md "SSOT 同步" 一节。
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const YAML_PATH = resolve(__dirname, "../api-registry.yaml");
const OUT_DIR = resolve(__dirname, "../src/generated");
const OUT_PATH = resolve(OUT_DIR, "t1_1-registry.json");

interface Param {
  name: string;
  type: string;
  required?: boolean;
  description: string;
}
interface Source {
  path: string;
  scope: string;
  params_template?: Record<string, string>;
  required?: boolean;
  condition?: string;
}
interface Summary {
  template: string;
  label: string;
}
interface Tool {
  name: string;
  group: string;
  category_name_zh: string;
  description: string;
  params?: Param[];
  sources: Source[];
  execution?: string;
  summary?: Summary;
}
interface Category {
  group: string;
  name_zh: string;
  tool_count: number;
}
interface Registry {
  version: string;
  categories: Category[];
  tools: Tool[];
}

function deriveCliMethod(name: string, group: string): string {
  // 1. 去前缀动词：get_ / search_ / verify_
  let method = name.replace(/^(get_|search_|verify_)/, "");
  // 2. 去分类前缀（如 group=company，方法 company_registration_info → registration_info）
  //    分类如 private_fund / financial_analysis / enterprise_report 同理处理
  if (method.startsWith(group + "_")) {
    method = method.slice(group.length + 1);
  }
  // 3. camelCase → kebab-case
  method = method.replace(/([a-z0-9])([A-Z])/g, "$1-$2");
  // 4. 下划线转连字符 + 小写 + 合并多余连字符
  method = method.replace(/_/g, "-").toLowerCase().replace(/-+/g, "-");
  // 5. 兜底：如剥离后为空（极端情况，如 name=get_<group>），回退到 group 名本身
  if (!method) method = group.replace(/_/g, "-");
  return method;
}

function main() {
  if (!existsSync(YAML_PATH)) {
    console.error(`Registry yaml not found: ${YAML_PATH}`);
    process.exit(1);
  }
  const raw = readFileSync(YAML_PATH, "utf-8");
  const data = parseYaml(raw) as Registry;
  if (!data.tools || !Array.isArray(data.tools)) {
    console.error("Invalid yaml: missing 'tools'");
    process.exit(1);
  }

  // 命名冲突校验：同分类下 cliMethod 不能重复
  const methodsByGroup: Record<string, Set<string>> = {};
  const enhanced = data.tools.map((t) => {
    const cliMethod = deriveCliMethod(t.name, t.group);
    const methods = methodsByGroup[t.group] || (methodsByGroup[t.group] = new Set());
    if (methods.has(cliMethod)) {
      console.error(`CLI method collision: ${t.group}.${cliMethod} (${t.name})`);
      process.exit(1);
    }
    methods.add(cliMethod);
    return { ...t, cliMethod };
  });

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(
    OUT_PATH,
    JSON.stringify(
      {
        version: data.version,
        categories: data.categories,
        tools: enhanced,
      },
      null,
      2
    )
  );
  console.log(`Generated ${OUT_PATH} (${enhanced.length} tools, ${data.categories.length} groups)`);
}

main();
