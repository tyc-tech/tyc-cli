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

// 顶层 help：把"最懂 AI 的 CLI"落在三层架构 + 调用顺序 + 可发现性上。
// Agent 看 tyc --help 时应立刻读懂"从 L0 起步，按 _summary 下钻"这件事。
const helpText = `
ARCHITECTURE — Layered Tool Discovery for LLM Agents (v5 §3.3 ①)

  Cognitive research shows LLM tool-selection accuracy collapses above
  30 tools (>95% at 10, ~70% at 30, <50% at 100+). tyc counters this with
  a 3-layer progressive-disclosure architecture:

    ┌─ L0  Overview      ${pad(getLayerCount("L0"), 3)} tools   cross-facet aggregation · scoring · entity-resolve
    ├─ L1  Drill-down    ${pad(getLayerCount("L1"), 3)} tools   one-hop into a specific data dimension
    └─ L2  Specialized   ${pad(getLayerCount("L2"), 3)} tools   id-based detail · search_* · vertical SKILLs

  Recommended call order:

    1. Start at L0.   Pick ONE of the ${getLayerCount("L0")} overview tools. Read the
                      response's _summary + drill_down hints.
    2. Descend to L1. Follow hints to a specific dimension
                      (shareholders / litigation / patents / annual reports …).
    3. Land on L2.    When L1 returns a list item with an \`id\`, a \`search_*\`
                      need arises, or a vertical SKILL is activated.

  Rule of thumb: the smaller the layer number, the higher the information
  density per token. Never skip L0 unless you already hold a USCC + a
  clear domain intent — otherwise you burn tokens on disambiguation.

DISCOVER BY LAYER

  tyc layers              one-screen architecture map
  tyc L0 list             list all ${getLayerCount("L0")} L0 tools (overview layer)
  tyc L1 list             list all ${getLayerCount("L1")} L1 tools (drill-down, grouped)
  tyc L2 list             list all ${getLayerCount("L2")} L2 tools (specialized, grouped)
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
