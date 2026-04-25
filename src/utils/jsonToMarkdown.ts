/**
 * JSON → Markdown 输出格式化
 *
 * 设计目标：
 * - 顶层简单字段渲染为 key/value 表格
 * - 项目元数据（_summary / _empty / _warnings）单独凸显
 * - items 列表自动渲染为表格
 * - 嵌套对象/对象数组优雅折叠
 */

type AnyValue = unknown;

const META_KEYS = new Set(["_summary", "_empty", "_warnings", "_tip"]);

function isPlainObject(v: AnyValue): v is Record<string, AnyValue> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function isEmptyValue(v: AnyValue): boolean {
  if (v === null || v === undefined || v === "") return true;
  if (Array.isArray(v) && v.length === 0) return true;
  if (isPlainObject(v) && Object.keys(v).length === 0) return true;
  return false;
}

function formatPrimitive(v: AnyValue): string {
  if (v === null || v === undefined || v === "") return "-";
  if (typeof v === "boolean") return v ? "是" : "否";
  return String(v);
}

function getAllKeys(arr: AnyValue[]): string[] {
  const seen = new Set<string>();
  for (const item of arr) {
    if (isPlainObject(item)) {
      for (const k of Object.keys(item)) seen.add(k);
    }
  }
  return Array.from(seen);
}

function escapeCell(s: string): string {
  // Markdown 表格内禁用 `|` 和换行
  return s.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function formatArrayCell(arr: AnyValue[]): string {
  if (arr.length === 0) return "-";
  // 全是基本类型：逗号分隔
  if (arr.every((x) => !isPlainObject(x) && !Array.isArray(x))) {
    return arr.map(formatPrimitive).join(", ");
  }
  // 对象数组：紧凑 JSON
  return JSON.stringify(arr).slice(0, 80) + (JSON.stringify(arr).length > 80 ? "…" : "");
}

function formatObjectInline(obj: Record<string, AnyValue>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (isEmptyValue(v)) continue;
    if (isPlainObject(v) || Array.isArray(v)) {
      parts.push(`${k}=…`);
    } else {
      parts.push(`${k}=${formatPrimitive(v)}`);
    }
  }
  return parts.join("; ") || "-";
}

function renderItemsTable(items: AnyValue[], title = "items"): string {
  if (items.length === 0) {
    return `\n### ${title} (空)\n`;
  }
  // 全基本类型 → 编号列表
  if (items.every((x) => !isPlainObject(x) && !Array.isArray(x))) {
    const lines = [`\n### ${title}（${items.length} 条）`, ""];
    items.forEach((v, i) => lines.push(`${i + 1}. ${formatPrimitive(v)}`));
    return lines.join("\n") + "\n";
  }
  // 对象数组 → Markdown 表格
  const cols = getAllKeys(items);
  if (cols.length === 0) return `\n### ${title} (无字段)\n`;
  const lines = [`\n### ${title}（${items.length} 条）`, ""];
  lines.push("| # | " + cols.join(" | ") + " |");
  lines.push("|---|" + cols.map(() => "---").join("|") + "|");
  items.forEach((row, i) => {
    if (!isPlainObject(row)) {
      lines.push(`| ${i + 1} | ${formatPrimitive(row)} |${" |".repeat(cols.length - 1)}`);
      return;
    }
    const cells = cols.map((c) => {
      const v = row[c];
      if (Array.isArray(v)) return escapeCell(formatArrayCell(v));
      if (isPlainObject(v)) return escapeCell(formatObjectInline(v));
      return escapeCell(formatPrimitive(v));
    });
    lines.push(`| ${i + 1} | ${cells.join(" | ")} |`);
  });
  return lines.join("\n") + "\n";
}

function renderTopFields(obj: Record<string, AnyValue>): string {
  const lines = ["", "## 主要字段", "", "| 字段 | 值 |", "|------|------|"];
  for (const [k, v] of Object.entries(obj)) {
    if (META_KEYS.has(k)) continue;
    if (k === "items") continue;
    if (Array.isArray(v)) {
      lines.push(`| ${k} | ${escapeCell(formatArrayCell(v))} |`);
    } else if (isPlainObject(v)) {
      lines.push(`| ${k} | ${escapeCell(formatObjectInline(v))} |`);
    } else {
      lines.push(`| ${k} | ${escapeCell(formatPrimitive(v))} |`);
    }
  }
  return lines.join("\n") + "\n";
}

function renderMeta(obj: Record<string, AnyValue>): string {
  const lines: string[] = [];
  if (obj._summary) {
    lines.push(`> 📋 **摘要**：${formatPrimitive(obj._summary)}`);
  }
  if (obj._tip) {
    lines.push(`> 💡 **提示**：${formatPrimitive(obj._tip)}`);
  }
  if (obj._empty === true) {
    lines.push(`> ⚪ **空结果**：未发现该维度记录`);
  }
  if (obj._warnings && isPlainObject(obj._warnings) && Object.keys(obj._warnings).length > 0) {
    lines.push(`> ⚠️ **警告**：`);
    for (const [path, msg] of Object.entries(obj._warnings)) {
      lines.push(`>    - \`${path}\`: ${formatPrimitive(msg)}`);
    }
  }
  return lines.length > 0 ? lines.join("\n") + "\n" : "";
}

function renderNestedObjects(obj: Record<string, AnyValue>): string {
  const lines: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (META_KEYS.has(k) || k === "items") continue;
    if (isPlainObject(v) && Object.keys(v).length > 0) {
      lines.push(`\n### ${k}（嵌套对象）`);
      lines.push("");
      lines.push("| 字段 | 值 |");
      lines.push("|------|------|");
      for (const [k2, v2] of Object.entries(v)) {
        if (Array.isArray(v2)) {
          lines.push(`| ${k2} | ${escapeCell(formatArrayCell(v2))} |`);
        } else if (isPlainObject(v2)) {
          lines.push(`| ${k2} | ${escapeCell(formatObjectInline(v2))} |`);
        } else {
          lines.push(`| ${k2} | ${escapeCell(formatPrimitive(v2))} |`);
        }
      }
    } else if (Array.isArray(v) && v.length > 0 && v.every((x) => isPlainObject(x))) {
      // 顶层非 items 的对象数组也渲染为表格
      lines.push(renderItemsTable(v, k));
    }
  }
  return lines.join("\n");
}

/**
 * 主入口：把任意 JSON 值渲染为 Markdown。
 * @param value 工具返回的 JSON（已 parse 为对象）
 * @param toolName 工具名（可选，用作标题）
 */
export function jsonToMarkdown(value: AnyValue, toolName?: string): string {
  if (value === null || value === undefined) {
    return "_(空)_\n";
  }
  if (!isPlainObject(value)) {
    if (Array.isArray(value)) return renderItemsTable(value);
    return "```\n" + formatPrimitive(value) + "\n```\n";
  }

  const obj = value as Record<string, AnyValue>;
  const parts: string[] = [];

  // 标题
  if (toolName) {
    parts.push(`# ${toolName}\n`);
  }
  if (typeof obj.name === "string") {
    parts.push(`**主体**：${obj.name}\n`);
  }

  // 元数据
  const meta = renderMeta(obj);
  if (meta) parts.push(meta);

  // 顶层字段
  const topFields = renderTopFields(obj);
  parts.push(topFields);

  // items 列表
  if (Array.isArray(obj.items)) {
    parts.push(renderItemsTable(obj.items, "items"));
  }

  // 其他嵌套对象 / 对象数组
  const nested = renderNestedObjects(obj);
  if (nested.trim()) parts.push(nested);

  return parts.join("\n").replace(/\n{3,}/g, "\n\n");
}
