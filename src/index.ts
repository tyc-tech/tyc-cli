#!/usr/bin/env node
import { Command } from "commander";
import { registerInitCommand } from "./commands/init.js";
import { registerLoginCommand } from "./commands/login.js";
import { registerCategoryCommands } from "./commands/category.js";
import { registerLayerCommands } from "./commands/layers.js";
import {
  getCategories,
  getLayerCount,
  getPriorityTools,
  getTotalCount,
} from "./registry.js";
import { VERSION } from "./version.js";

// 顶层 help 保持为快速入口：讲清分层、调用顺序、发现命令和输出控制；
// 更完整的架构说明放在 `tyc layers`。
const helpText = `
工具分层

  tyc 采用 4 层渐进发现，默认只把 L0 + L1 的 ${
    getLayerCount("L0") + getLayerCount("L1")
  } 个高密度工具暴露给 Agent，再按需下钻到 L2/L3。

    ┌─ L0  实体锚定    ${pad(getLayerCount("L0"), 3)} 个工具   简称 / 曾用名 / 模糊名 → 精确企业
    ├─ L1  概要总览    ${pad(getLayerCount("L1"), 3)} 个工具   每个 facet 1 个总览工具，返回 _summary
    ├─ L2  维度下钻    ${pad(getLayerCount("L2"), 3)} 个工具   股东、诉讼、商标、招投标、年报等明细维度
    └─ L3  专项工具    ${pad(getLayerCount("L3"), 3)} 个工具   id 详情、search_*、垂直场景和专业查询

推荐调用顺序

  0. 先做 L0：用用户给出的原始企业名调用 \`search_companies\`，确认唯一企业、
              统一社会信用代码和企业全名。
  1. 再看 L1：按问题选择 1 个概要工具，读取 _summary 判断下一步。
  2. 下钻 L2：选择具体数据维度；不确定时优先用对应 facet 的 L2★ 工具。
  3. 进入 L3：需要记录 id 详情、跨主体 search_* 或垂直 SKILL 时再使用。

L2 优先 ★（${getPriorityTools().length} 个，每个 facet 1 个）

  Agent 拿到 L1 _summary 后若不确定走哪个 L2，对应 facet 的"L2 优先"是默认下钻：

${renderPriorityLines()}

按层发现

  tyc layers              查看一屏架构图和推荐调用顺序
  tyc L0 list             列出 ${getLayerCount("L0")} 个 L0 工具
  tyc L1 list             列出 ${getLayerCount("L1")} 个 L1 工具
  tyc L2 list             列出 ${getLayerCount("L2")} 个 L2 工具（★ 优先工具置顶）
  tyc L3 list             列出 ${getLayerCount("L3")} 个 L3 工具
  tyc L0 list --md        输出 Markdown 表格
  tyc L0 list --json      输出 JSON（含工具名、CLI、参数、描述、优先级）
  tyc company capabilities <company_id> --company-name <name>
                         根据 L0 返回的 company_id 打印可直接执行的工具清单

按分类发现（与层级正交，共 6 组）

${renderCategoryLines()}

全局输出选项（所有工具命令均可使用）

  以下选项可用于所有工具调用；具体工具 help 不重复展开完整列表。

  默认        缩进 JSON，兼顾人类阅读和 Agent 解析
  --pretty    同默认输出，保留用于显式声明意图
  --compact   单行紧凑 JSON，适合管道和 jq
  --md        Markdown 表格，适合终端阅读或粘贴给 Agent
  --verbose   额外把 shared core 请求详情打印到 stderr

  --head [N]            只输出前 N 行；只写 flag 时默认 50 行
  --tail [M]            只输出后 M 行；只写 flag 时默认 20 行
  --full                强制输出完整内容，优先级最高
  --threshold <BYTES>   超过指定字节数时从头截断；不传则不自动截断
  --output-file <PATH>  把完整结果写入文件；必须显式指定才会落盘

初始化与登录

  tyc login                                             OAuth 浏览器登录
  tyc login --no-block                                 打印 Device Flow URL 和 6 位验证码后立即退出
  tyc login --resume                                   继续非阻塞 Device Flow 登录
  tyc login --callback-token <CODE_OR_CALLBACK_URL>    继续旧版 callback OAuth 登录
  tyc login --url <MCP_URL>                             登录本地、预发或自托管 MCP
  tyc init --authorization <KEY>                        使用 API Key 兼容路径
  tyc init --url <MCP_URL> --authorization <KEY>        配置本地或自托管服务
`;

function pad(n: number, width: number): string {
  const s = String(n);
  return s.length >= width ? s : " ".repeat(width - s.length) + s;
}

function renderCategoryLines(): string {
  const lines: string[] = [];
  for (const c of getCategories()) {
    lines.push(
      `  tyc ${c.group.padEnd(22)} ${c.name_zh}  (${c.tool_count} 个工具)`
    );
  }
  return lines.join("\n");
}

function renderPriorityLines(): string {
  const lines: string[] = [];
  for (const t of getPriorityTools()) {
    lines.push(
      `  ★ ${t.group.padEnd(22)} ${t.name.padEnd(36)} (tyc ${t.group} ${t.cliMethod})`,
    );
  }
  return lines.join("\n");
}

const program = new Command()
  .name("tyc")
  .description(
    `天眼查 AI CLI：${getTotalCount()} 个商业数据工具 · L0=${getLayerCount(
      "L0"
    )} L1=${getLayerCount("L1")} L2=${getLayerCount(
      "L2"
    )} L3=${getLayerCount(
      "L3"
    )} · 面向 Agent 的 MCP 工具网关`
  )
  .version(VERSION, "-V, --version", "输出版本号")
  .helpOption("-h, --help", "显示命令帮助")
  .addHelpCommand("help [command]", "显示命令帮助")
  .configureHelp({
    styleTitle(title: string): string {
      const titleMap: Record<string, string> = {
        "Usage:": "用法:",
        "Arguments:": "参数:",
        "Options:": "选项:",
        "Global Options:": "全局选项:",
        "Commands:": "命令:",
      };
      return titleMap[title] || title;
    },
  })
  .option("--pretty", "缩进 JSON 输出（默认行为，flag 保留以保持向后兼容）")
  .option("--md", "Markdown 表格化输出（适合人类阅读 / Agent 上屏）")
  .option("--compact", "紧凑单行 JSON（管道 / jq 场景；为旧默认行为）")
  .option("--verbose", "打印 shared core 请求详情到 stderr")
  .option(
    "--head [n]",
    "仅输出前 N 行（不传值默认 50；与 --tail 同时给则同时输出两端）",
  )
  .option(
    "--tail [m]",
    "仅输出后 M 行（不传值默认 20；与 --head 同时给则同时输出两端）",
  )
  .option("--full", "强制输出完整内容（最高优先级，覆盖 --head/--tail/--threshold）")
  .option(
    "--output-file <path>",
    "把完整结果写入指定路径（必须显式指定；不传则永不落盘）",
  )
  .option(
    "--threshold <bytes>",
    "字节截断主开关：超过该字节数则从头按字节截断；不传则永不截断",
  )
  .addHelpText("after", helpText);

registerInitCommand(program);
registerLoginCommand(program);
registerLayerCommands(program);
registerCategoryCommands(program);

program.parseAsync(process.argv).catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(msg);
  process.exit(1);
});
