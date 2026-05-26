#!/usr/bin/env node
import { Command } from "commander";
import { registerInitCommand } from "./commands/init.js";
import { registerCategoryCommands } from "./commands/category.js";
import { registerLayerCommands } from "./commands/layers.js";
import {
  getCategories,
  getLayerCount,
  getPriorityTools,
  getTotalCount,
} from "./registry.js";
import { VERSION } from "./version.js";

// 顶层 help：把"最懂 AI 的 CLI"落在 4 层架构 + 调用顺序 + 可发现性上。
// Agent 看 tyc --help 时应立刻读懂"先 L0 锚定企业，再 L1 概览，再 L2 下钻，最后 L3 详情"这条主线。
const helpText = `
ARCHITECTURE — Layered Tool Discovery for LLM Agents

  Cognitive research shows LLM tool-selection accuracy collapses above
  30 tools (>95% at 10, ~70% at 30, <50% at 100+). tyc counters this with
  a 4-layer progressive-disclosure architecture, led by a dedicated
  entity-resolution layer:

    ┌─ L0  Resolve       ${pad(getLayerCount("L0"), 3)} tool    entity resolution · 简称/曾用名/模糊名 → 精确企业
    ├─ L1  Overview     ${pad(getLayerCount("L1"), 3)} tools   one captain per facet · returns _summary for routing
    ├─ L2  Drill-down   ${pad(getLayerCount("L2"), 3)} tools   one-hop into a specific data dimension (★ = L2 优先, see below)
    └─ L3  Specialized  ${pad(getLayerCount("L3"), 3)} tools   id-based detail · search_* · vertical SKILLs

  Recommended call order:

    0. Anchor at L0.   Feed the user's raw company name (可能是简称/曾用名/模糊
                        指代) into \`search_companies\`; lock onto one entity
                        with a USCC + official name before anything else.
    1. Ascend to L1.   Pick ONE of the ${getLayerCount("L1")} overview tools with the
                        anchored USCC. Read _summary, then use layer lists or
                        MCP get_company_capabilities for the next tool.
    2. Descend to L2.  Pick a specific dimension
                        (shareholders / litigation / patents / annual reports …).
                        If unsure which L2, default to that facet's L2★ 优先 (below).
    3. Land on L3.     When L2 returns a list item with an \`id\`, a \`search_*\`
                        need arises, or a vertical SKILL is activated.

  Rule of thumb: the smaller the layer number, the higher the information
  density per token. L0 is MANDATORY — skipping it (without a USCC already
  in hand) wastes downstream calls on the wrong entity.
  Default LLM surface = L0 + L1 = ${getLayerCount("L0") + getLayerCount("L1")} tools (≤ 15-tool exposure limit).

L2 优先 ★ — \`L2★ 队副\`（${getPriorityTools().length} 个，每 facet 1 个）

  Agent 拿到 L1 _summary 后若不确定走哪个 L2，对应 facet 的"L2 优先"是默认下钻：

${renderPriorityLines()}

  Detail: tyc layers / tyc L2 list   (★ marks priority rows)

DISCOVER BY LAYER

  tyc layers              one-screen architecture map (含 L2 优先映射)
  tyc L0 list             list the ${getLayerCount("L0")} L0 tool (entity-resolve layer)
  tyc L1 list             list all ${getLayerCount("L1")} L1 tools (overview, grouped)
  tyc L2 list             list all ${getLayerCount("L2")} L2 tools (drill-down; ★ priority pinned to top)
  tyc L3 list             list all ${getLayerCount("L3")} L3 tools (specialized, grouped)
  tyc L0 list --md        Markdown tables (agent on-screen)
  tyc L0 list --json      machine-readable JSON (id · cli · params · description · priority)

DISCOVER BY CATEGORY (orthogonal to layers, 6 groups)

${renderCategoryLines()}

OUTPUT FORMATS (mutually exclusive, priority: --md > --compact > --pretty / default)

  (default)    indented JSON (pretty) — readable for both humans and agents
  --pretty     same as default (kept for backward compatibility / explicit intent)
  --compact    compact single-line JSON (pipe / jq friendly; old default behavior)
  --md         Markdown tables (human + agent on-screen)
  --verbose    also print MCP request details to stderr (orthogonal to above)

OUTPUT TRUNCATION & DUMP  (orthogonal — apply to any sub-command)

  --head [N]            print only the first N lines  (N defaults to 50 if flag given alone)
  --tail [M]            print only the last M lines   (M defaults to 20 if flag given alone)
                          · --head + --tail together: head + "... omitted ..." + tail
                          · either flag alone: that side only
  --full                force-print the FULL rendered content (no truncation; highest priority)
  --threshold <BYTES>   master switch for byte-truncation. Without --threshold there is
                        NO automatic truncation, regardless of output size.
                        With --threshold N: when rendered output > N bytes, byte-truncate
                        from the head; --head / --tail are IGNORED in this mode.
  --output-file <PATH>  write the FULL rendered content to PATH. **No file is written
                        unless --output-file is explicitly passed** (no auto-dump).
                        Combine with --head/--tail/--threshold to keep stdout terse
                        while preserving the full result on disk.

SETUP

  tyc init --authorization <KEY>                        default https://mcp.tianyancha.com/v1
  tyc init --url <MCP_URL> --authorization <KEY>        local / self-hosted

Every tool returns tyc OpenAPI native English keys verbatim. The MCP Server
handles multi-source merge, Asia/Shanghai timestamp formatting, _summary
injection, and empty-result normalization — the CLI just tells the Agent
where the data is and what it looks like.
`;

function pad(n: number, width: number): string {
  const s = String(n);
  return s.length >= width ? s : " ".repeat(width - s.length) + s;
}

function renderCategoryLines(): string {
  const lines: string[] = [];
  for (const c of getCategories()) {
    lines.push(
      `  tyc ${c.group.padEnd(22)} ${c.name_zh}  (${c.tool_count} tools)`
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
    `Tianyan AI CLI — ${getTotalCount()} commercial-data tools · L0=${getLayerCount(
      "L0"
    )} L1=${getLayerCount("L1")} L2=${getLayerCount(
      "L2"
    )} L3=${getLayerCount(
      "L3"
    )} · the AI-native gateway (pair with the TA MCP Server)`
  )
  .version(VERSION)
  .option("--pretty", "缩进 JSON 输出（默认行为，flag 保留以保持向后兼容）")
  .option("--md", "Markdown 表格化输出（适合人类阅读 / Agent 上屏）")
  .option("--compact", "紧凑单行 JSON（管道 / jq 场景；为旧默认行为）")
  .option("--verbose", "打印 MCP 请求详情到 stderr")
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
registerLayerCommands(program);
registerCategoryCommands(program);

program.parseAsync(process.argv).catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(msg);
  process.exit(1);
});
