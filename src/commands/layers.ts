// tyc L0 / L1 / L2 / L3 list  ·  tyc layers
//
// 本文件把"AI 优先的工具发现"这一 CLI 核心卖点落地为具体命令：
//   - tyc layers          一屏看 4 层全景（架构 + 数量 + 推荐调用顺序）
//   - tyc L0 list [--md|--json]   列出 L0（1 个实体锚定工具：search_companies）
//   - tyc L1 list [--md|--json]   列出 L1（6 个 facet 队长，每 facet 1 个总览）
//   - tyc L2 list [--md|--json]   列出 L2（60 个明细工具，按分类分组）
//   - tyc L3 list [--md|--json]   列出 L3（100 个专业工具，按分类分组）
//
// 设计哲学：
//   LLM 工具选择准确率在 10 内 >95%、30 掉到 ~70%、100+ <50%。
//   tyc 把 L0 剥成"实体锚定"单 tool，L1 收敛为"6 facet × 1 队长"对称结构，
//   默认推荐给 LLM 的 = L0 + L1 = 7（≤ 15 默认暴露阈值），L2/L3 按 _summary +
//   drill_down 按需发现。本命令的输出专门面向 Agent：紧凑、可 grep、可 JSON 解析。
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
    title: "Resolve · 实体锚定层",
    summary:
      "把用户输入(简称 / 曾用名 / 模糊指代)解析成精确企业列表（USCC + 别名 + 状态）。Agent 第 0 跳：所有下游工具都依赖锚定结果。",
    trigger: '"是哪家公司 / 帮我查 XX / 我想看 X 集团" — 用户给的是名字而非 USCC',
    contract: "返回候选企业列表（含 USCC、企业全名、注册状态、别名）；Agent 据此挑定唯一企业再走 L1。",
  },
  {
    layer: "L1",
    title: "Overview · 概要层",
    summary:
      "**6 个 facet 队长，每 facet 1 个总览**：company-base / 风险 / 知产 / 经营信用 / 历史 / 董监高 各 1 个 L1 工具，单次调用聚合该 facet 多子维度。",
    trigger: '"这家公司整体怎么样 / 风险如何 / 知产实力 / 经营状况 / 历史变更 / 这个人是谁"',
    contract: "Agent 按 facet 选 1 个 L1 调用即得 _summary + drill_down 线索；不需要你预先在 facet 内挑子维度。",
  },
  {
    layer: "L2",
    title: "Drill-down · 明细层",
    summary:
      "一级数据维度展开：股权 / 诉讼 / 招投标 / 年报 / 知识产权 / 历史工商 / 人员任职 ……",
    trigger: "L1 `_summary` 指示\"有 X 条 Y\"时，针对该维度精确下钻。",
    contract: "返回 tyc 英文 key 透传的 items 列表 + 顶层聚合字段。",
  },
  {
    layer: "L3",
    title: "Specialized · 专业层",
    summary:
      "ID 详情、search_*、上市公司专项、私募基金、建筑资质、投资机构、地理位置、人员微查询 ……",
    trigger: "L2 列表中某条记录的 id 需要展开、或触发垂直行业 SKILL（尽调/风控/知产）。",
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
      `一屏总览 tyc-cli 的 4 层工具架构（L0 ${getLayerCount("L0")} / L1 ${getLayerCount(
        "L1"
      )} / L2 ${getLayerCount("L2")} / L3 ${getLayerCount(
        "L3"
      )}），面向 AI Agent 的推荐调用顺序`
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
            `0. Anchor at L0 — feed the user's raw company name into the ${getLayerCount("L0")} L0 tool (search_companies); lock onto a USCC + official name`,
            `1. Ascend to L1 — pick ONE of the ${getLayerCount("L1")} overview tools with the anchored USCC`,
            "2. Read _summary + drill_down hints from the response",
            `3. Drill to L2 for a specific dimension (items + totals; ${getLayerCount("L2")} tools)`,
            `4. Reach L3 for id-based detail, search_*, or vertical SKILL tools (${getLayerCount("L3")} tools)`,
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
  const defaultSurface = getLayerCount("L0") + getLayerCount("L1");
  const lines: string[] = [];
  lines.push("tyc-cli · Layered Tool Architecture");
  lines.push(
    `Total ${total} tools  ·  L0=${getLayerCount("L0")}  L1=${getLayerCount(
      "L1"
    )}  L2=${getLayerCount("L2")}  L3=${getLayerCount("L3")}`
  );
  lines.push(
    "Rationale: LLM tool-selection accuracy collapses beyond 30 tools."
  );
  lines.push(
    `  tyc carves L0 into a single entity-resolution tool, so the default LLM`
  );
  lines.push(
    `  surface is L0 + L1 = ${defaultSurface} tools (≤ 15-tool exposure limit);`
  );
  lines.push("  L2/L3 are discovered on demand via _summary / drill_down_tools.");
  lines.push("");
  for (const s of LAYER_SPECS) {
    const n = getLayerCount(s.layer);
    lines.push(`[${s.layer}] ${s.title}  (${n} tool${n === 1 ? "" : "s"})`);
    lines.push(`      ${s.summary}`);
    lines.push(`      Trigger: ${s.trigger}`);
    lines.push(`      Contract: ${s.contract}`);
    lines.push(`      List:    tyc ${s.layer} list [--md|--json]`);
    lines.push("");
  }
  lines.push("Recommended call order for agents:");
  lines.push(
    `  0. Anchor at L0 — feed the user's raw company name into the ${getLayerCount("L0")} L0 tool (search_companies)`
  );
  lines.push(
    `  1. Ascend to L1 — one of the ${getLayerCount("L1")} overview tools, with the anchored USCC`
  );
  lines.push("  2. Read _summary + drill_down hints in the response");
  lines.push(`  3. Drill to L2 for a specific dimension (${getLayerCount("L2")} tools)`);
  lines.push(
    `  4. Reach L3 for id-based detail / search_* / vertical SKILL (${getLayerCount("L3")} tools)`
  );
  return lines.join("\n");
}

function renderLayersMarkdown(): string {
  const defaultSurface = getLayerCount("L0") + getLayerCount("L1");
  const lines: string[] = [];
  lines.push("# tyc-cli · Layered Tool Architecture");
  lines.push("");
  lines.push(
    `> Total **${getTotalCount()}** tools · **L0=${getLayerCount("L0")}** · **L1=${getLayerCount(
      "L1"
    )}** · **L2=${getLayerCount("L2")}** · **L3=${getLayerCount("L3")}**  `
  );
  lines.push(
    `> Design rationale: LLM tool-selection accuracy collapses above 30 tools; tyc carves L0 into a dedicated entity-resolution tool so the default LLM surface = L0 + L1 = ${defaultSurface} tools (≤ 15-tool limit), discovers L2/L3 on demand.`
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
  lines.push(
    `0. Anchor at L0 — feed the user's raw company name into the ${getLayerCount("L0")} L0 tool (\`search_companies\`); lock onto a USCC + official name.`
  );
  lines.push(
    `1. Ascend to L1 — pick ONE of the ${getLayerCount("L1")} overview tools with the anchored USCC.`
  );
  lines.push("2. Read `_summary` + `drill_down` hints in the response.");
  lines.push(
    `3. Drill to L2 for a specific dimension (items + totals; ${getLayerCount("L2")} tools).`
  );
  lines.push(
    `4. Reach L3 for id-based detail, \`search_*\`, or vertical SKILL tools (${getLayerCount("L3")} tools).`
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
  const n = tools.length;
  lines.push(
    `${spec.layer} · ${spec.title}  (${n} tool${n === 1 ? "" : "s"})`
  );
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
  const n = tools.length;
  lines.push(`# ${spec.layer} · ${spec.title}`);
  lines.push("");
  lines.push(`> **${n} tool${n === 1 ? "" : "s"}** · ${spec.summary}  `);
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
