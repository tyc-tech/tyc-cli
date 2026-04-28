#!/usr/bin/env node
import { Command } from "commander";
import { registerInitCommand } from "./commands/init.js";
import { registerCategoryCommands } from "./commands/category.js";
import { registerLayerCommands } from "./commands/layers.js";
import {
  getCategories,
  getLayerCount,
  getTotalCount,
} from "./registry.js";

// 顶层 help：把"最懂 AI 的 CLI"落在 4 层架构 + 调用顺序 + 可发现性上。
// Agent 看 tyc --help 时应立刻读懂"先 L0 锚定企业，再 L1 概览，再 L2 下钻，最后 L3 详情"这条主线。
const helpText = `
ARCHITECTURE — Layered Tool Discovery for LLM Agents (v5 §3.3 ①)

  Cognitive research shows LLM tool-selection accuracy collapses above
  30 tools (>95% at 10, ~70% at 30, <50% at 100+). tyc counters this with
  a 4-layer progressive-disclosure architecture, led by a dedicated
  entity-resolution layer:

    ┌─ L0  Resolve       ${pad(getLayerCount("L0"), 3)} tool    entity resolution · 简称/曾用名/模糊名 → 精确企业
    ├─ L1  Overview     ${pad(getLayerCount("L1"), 3)} tools   cross-facet aggregation · scoring · entity-check
    ├─ L2  Drill-down   ${pad(getLayerCount("L2"), 3)} tools   one-hop into a specific data dimension
    └─ L3  Specialized  ${pad(getLayerCount("L3"), 3)} tools   id-based detail · search_* · vertical SKILLs

  Recommended call order:

    0. Anchor at L0.   Feed the user's raw company name (可能是简称/曾用名/模糊
                        指代) into \`search_companies\`; lock onto one entity
                        with a USCC + official name before anything else.
    1. Ascend to L1.   Pick ONE of the ${getLayerCount("L1")} overview tools with the
                        anchored USCC. Read the response's _summary + drill_down.
    2. Descend to L2.  Follow hints to a specific dimension
                        (shareholders / litigation / patents / annual reports …).
    3. Land on L3.     When L2 returns a list item with an \`id\`, a \`search_*\`
                        need arises, or a vertical SKILL is activated.

  Rule of thumb: the smaller the layer number, the higher the information
  density per token. L0 is MANDATORY — skipping it (without a USCC already
  in hand) wastes downstream calls on the wrong entity.
  Default LLM surface = L0 + L1 = ${getLayerCount("L0") + getLayerCount("L1")} tools (≤ v5's 15-tool limit).

DISCOVER BY LAYER

  tyc layers              one-screen architecture map
  tyc L0 list             list the ${getLayerCount("L0")} L0 tool (entity-resolve layer)
  tyc L1 list             list all ${getLayerCount("L1")} L1 tools (overview, grouped)
  tyc L2 list             list all ${getLayerCount("L2")} L2 tools (drill-down, grouped)
  tyc L3 list             list all ${getLayerCount("L3")} L3 tools (specialized, grouped)
  tyc L0 list --md        Markdown tables (agent on-screen)
  tyc L0 list --json      machine-readable JSON (id · cli · params · description)

DISCOVER BY CATEGORY (orthogonal to layers, 6 groups)

${renderCategoryLines()}

OUTPUT FORMATS (mutually exclusive, priority: --md > --pretty > default)

  (default)    compact single-line JSON (pipe-friendly)
  --pretty     indented JSON (debug)
  --md         Markdown tables (human + agent on-screen)
  --verbose    also print MCP request details to stderr

SETUP

  tyc init --authorization <KEY>                        default https://ai-mcp.tianyancha.com/mcp
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
  .version("0.3.0")
  .option("--pretty", "格式化 JSON 输出（缩进 2 空格）")
  .option("--md", "Markdown 表格化输出（适合人类阅读 / Agent 上屏）")
  .option("--verbose", "打印 MCP 请求详情到 stderr")
  .addHelpText("after", helpText);

registerInitCommand(program);
registerLayerCommands(program);
registerCategoryCommands(program);

program.parseAsync(process.argv).catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(msg);
  process.exit(1);
});
