// tyc L0 / L1 / L2 list  ·  tyc layers
//
// 本文件把"AI 优先的工具发现"这一 CLI 核心卖点落地为具体命令：
//   - tyc layers          一屏看三层全景（架构 + 数量 + 推荐调用顺序）
//   - tyc L0 list [--md|--json]   列出 L0（14 个概要工具）
//   - tyc L1 list [--md|--json]   列出 L1（53 个明细工具，按分类分组）
//   - tyc L2 list [--md|--json]   列出 L2（100 个专业工具，按分类分组）
//
// 设计哲学（对齐 v5 §3.3 ①）：
//   LLM 工具选择准确率在 10 内 >95%、30 掉到 ~70%、100+ <50%。
//   tyc 默认只向 LLM 暴露 L0 14 个（远低于 15 阈值），L1/L2 按需发现。
//   本命令的输出专门面向 Agent：紧凑、可 grep、可 JSON 解析。
import type { Command } from "commander";
import {
  getCategories,
  getCategoryName,
  getLayerCount,
  getLayerSummaries,
  getToolsByLayer,
  getTotalCount,
} from "../registry.js";
import type { CatalogTool, ToolLayer } from "../types.js";

type ListOpts = { md?: boolean; json?: boolean };

interface LayerSpec {
  layer: ToolLayer;
  title: string;
  summary: string;
  trigger: string;
  contract: string;
}

const LAYER_SPECS: LayerSpec[] = [
  {
    layer: "L0",
    title: "Overview · 概要层",
    summary: "跨维度聚合、总览、评分、实体锚定。Agent 处理用户自然语言后的第一跳。",
    trigger: '"是什么公司 / 整体怎么样 / 有没有风险 / 能不能信任"',
    contract: "不需要你提前知道维度；一次调用就能拿到 _summary + drill_down 线索。",
  },
  {
    layer: "L1",
    title: "Drill-down · 明细层",
    summary: "一级数据维度展开：股权 / 诉讼 / 招投标 / 年报 / 知识产权 / 历史工商 / 人员任职……",
    trigger: "L0 `_summary` 指示\"有 X 条 Y\"时，针对该维度精确下钻。",
    contract: "返回 tyc 英文 key 透传的 items 列表 + 顶层聚合字段。",
  },
  {
    layer: "L2",
    title: "Specialized · 专业层",
    summary: "ID 详情、search_*、上市公司专项、私募基金、建筑资质、投资机构、地理位置、人员微查询……",
    trigger: "L1 列表中某条记录的 id 需要展开、或触发垂直行业 SKILL（尽调/风控/知产）。",
    contract: "面向专业 Agent 和 SKILL Pack；多数需要 id 或二级关键词。",
  },
];

export function registerLayerCommands(program: Command): void {
  registerLayers(program);
  for (const spec of LAYER_SPECS) {
    registerLayerCmd(program, spec);
  }
}

function registerLayers(program: Command): void {
  program
    .command("layers")
    .description(
      `一屏总览 tyc-cli 的 3 层工具架构（L0 ${getLayerCount("L0")} / L1 ${getLayerCount(
        "L1"
      )} / L2 ${getLayerCount("L2")}），面向 AI Agent 的推荐调用顺序`
    )
    .option("--md", "Markdown 表格（适合 Agent 上屏 / 粘进 README）")
    .option("--json", "机读 JSON（layers 汇总 + 各层工具元数据）")
    .action((opts: ListOpts) => {
      if (opts.json) {
        const payload = {
          total: getTotalCount(),
          layers: LAYER_SPECS.map((s) => ({
            layer: s.layer,
            title: s.title,
            count: getLayerCount(s.layer),
            trigger: s.trigger,
            summary: s.summary,
            contract: s.contract,
          })),
          categories: getCategories(),
          recommended_call_order: [
            "1. Start at L0 — pick ONE of the 14 overview tools",
            "2. Read _summary + drill_down hints from the response",
            "3. Drill to L1 for a specific dimension (items + totals)",
            "4. Reach L2 for id-based detail, search_*, or vertical SKILL tools",
          ],
        };
        console.log(JSON.stringify(payload, null, 2));
        return;
      }
      if (opts.md) {
        console.log(renderLayersMarkdown());
        return;
      }
      console.log(renderLayersText());
    });
}

function registerLayerCmd(program: Command, spec: LayerSpec): void {
  const layer = spec.layer;
  const cmd = program
    .command(layer)
    .description(
      `${spec.title}（${getLayerCount(layer)} 个）— ${spec.summary}`
    );

  cmd
    .command("list")
    .description(
      `列出 ${layer} 全部 ${getLayerCount(layer)} 个工具（默认按分类分组文本表格）`
    )
    .option("--md", "Markdown 表格（适合 Agent 上屏）")
    .option("--json", "机读 JSON（工具 ID / cliMethod / 分类 / 参数 / 描述）")
    .action((opts: ListOpts) => {
      const tools = getToolsByLayer(layer);
      if (opts.json) {
        const payload = {
          layer,
          title: spec.title,
          count: tools.length,
          trigger: spec.trigger,
          contract: spec.contract,
          tools: tools.map((t) => ({
            name: t.name,
            group: t.group,
            category_name_zh: t.categoryNameZh,
            cli: `tyc ${t.group} ${t.cliMethod}`,
            description: t.description,
            params: t.params ?? [],
          })),
        };
        console.log(JSON.stringify(payload, null, 2));
        return;
      }
      if (opts.md) {
        console.log(renderLayerListMarkdown(spec, tools));
        return;
      }
      console.log(renderLayerListText(spec, tools));
    });
}

// ─────────────────────────── 渲染：tyc layers ───────────────────────────

function renderLayersText(): string {
  const total = getTotalCount();
  const lines: string[] = [];
  lines.push("tyc-cli · Layered Tool Architecture (v5 §3.3 ①)");
  lines.push(
    `Total ${total} tools  ·  L0=${getLayerCount("L0")}  L1=${getLayerCount("L1")}  L2=${getLayerCount("L2")}`
  );
  lines.push(
    "Rationale: LLM tool-selection accuracy collapses beyond 30 tools."
  );
  lines.push(
    "  tyc counters by default-exposing 14 L0 tools (<v5's 15-tool limit);"
  );
  lines.push("  L1/L2 are discovered on demand via _summary / drill_down_tools.");
  lines.push("");
  for (const s of LAYER_SPECS) {
    lines.push(`[${s.layer}] ${s.title}  (${getLayerCount(s.layer)} tools)`);
    lines.push(`      ${s.summary}`);
    lines.push(`      Trigger: ${s.trigger}`);
    lines.push(`      Contract: ${s.contract}`);
    lines.push(`      List:    tyc ${s.layer} list [--md|--json]`);
    lines.push("");
  }
  lines.push("Recommended call order for agents:");
  lines.push("  1. Start at L0 — one of the 14 overview tools");
  lines.push("  2. Read _summary + drill_down hints in the response");
  lines.push("  3. Drill to L1 for a specific dimension");
  lines.push("  4. Reach L2 for id-based detail / search_* / vertical SKILL");
  return lines.join("\n");
}

function renderLayersMarkdown(): string {
  const lines: string[] = [];
  lines.push("# tyc-cli · Layered Tool Architecture");
  lines.push("");
  lines.push(
    `> Total **${getTotalCount()}** tools · **L0=${getLayerCount("L0")}** · **L1=${getLayerCount("L1")}** · **L2=${getLayerCount("L2")}**  `
  );
  lines.push(
    "> Design rationale (v5 §3.3 ①): LLM tool-selection accuracy collapses above 30 tools; tyc default-exposes only 14 L0 tools, discovers L1/L2 on demand."
  );
  lines.push("");
  lines.push("| Layer | Tools | Summary | Trigger |");
  lines.push("|---|---:|---|---|");
  for (const s of LAYER_SPECS) {
    lines.push(
      `| **${s.layer}** ${s.title} | ${getLayerCount(s.layer)} | ${escapeCell(s.summary)} | ${escapeCell(s.trigger)} |`
    );
  }
  lines.push("");
  lines.push("**Recommended call order for agents**");
  lines.push("");
  lines.push("1. Start at L0 — pick ONE of the 14 overview tools.");
  lines.push("2. Read `_summary` + `drill_down` hints in the response.");
  lines.push("3. Drill to L1 for a specific dimension (items + totals).");
  lines.push(
    "4. Reach L2 for id-based detail, `search_*`, or vertical SKILL tools."
  );
  lines.push("");
  lines.push("**Discover each layer**");
  lines.push("");
  for (const s of LAYER_SPECS) {
    lines.push(`- \`tyc ${s.layer} list\` — ${s.title}`);
  }
  return lines.join("\n");
}

// ─────────────────── 渲染：tyc L0/L1/L2 list ───────────────────

function renderLayerListText(spec: LayerSpec, tools: CatalogTool[]): string {
  const lines: string[] = [];
  lines.push(`${spec.layer} · ${spec.title}  (${tools.length} tools)`);
  lines.push(`Trigger: ${spec.trigger}`);
  lines.push("");

  // 按 group 分组打印（按 categories 中声明顺序）
  const groupsOrder = getCategories().map((c) => c.group);
  const grouped = new Map<string, CatalogTool[]>();
  for (const t of tools) {
    const arr = grouped.get(t.group) || [];
    arr.push(t);
    grouped.set(t.group, arr);
  }
  for (const g of groupsOrder) {
    const arr = grouped.get(g);
    if (!arr || arr.length === 0) continue;
    const zh = getCategoryName(g);
    lines.push(`── ${g}  (${zh}, ${arr.length}) ──`);
    for (const t of arr) {
      const cli = `tyc ${t.group} ${t.cliMethod}`;
      lines.push(`  ${pad(t.name, 46)}  ${cli}`);
      lines.push(`    ${oneLine(t.description)}`);
    }
    lines.push("");
  }
  lines.push(
    `Next: read ${spec.contract}`
  );
  return lines.join("\n");
}

function renderLayerListMarkdown(
  spec: LayerSpec,
  tools: CatalogTool[]
): string {
  const lines: string[] = [];
  lines.push(`# ${spec.layer} · ${spec.title}`);
  lines.push("");
  lines.push(`> **${tools.length} tools** · ${spec.summary}  `);
  lines.push(`> Trigger: ${spec.trigger}`);
  lines.push("");
  const groupsOrder = getCategories().map((c) => c.group);
  const grouped = new Map<string, CatalogTool[]>();
  for (const t of tools) {
    const arr = grouped.get(t.group) || [];
    arr.push(t);
    grouped.set(t.group, arr);
  }
  for (const g of groupsOrder) {
    const arr = grouped.get(g);
    if (!arr || arr.length === 0) continue;
    const zh = getCategoryName(g);
    lines.push(`## ${g} — ${zh}（${arr.length}）`);
    lines.push("");
    lines.push("| Tool | CLI | Description |");
    lines.push("|---|---|---|");
    for (const t of arr) {
      const cli = `\`tyc ${t.group} ${t.cliMethod}\``;
      lines.push(
        `| \`${t.name}\` | ${cli} | ${escapeCell(oneLine(t.description))} |`
      );
    }
    lines.push("");
  }
  return lines.join("\n");
}

// ─────────────────── utils ───────────────────

function pad(s: string, width: number): string {
  if (s.length >= width) return s;
  return s + " ".repeat(width - s.length);
}

function oneLine(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function escapeCell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}
