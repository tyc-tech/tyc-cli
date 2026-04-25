// T1.1 Transformer (TS 版本)
// 对齐 tools/t1_1/transformer/transformer.go：
//   1. 按 sources 声明顺序做顶层 map 覆盖合并
//   2. 时间戳字段值格式化为 Asia/Shanghai 字符串（key 不变）
//   3. 注入 _summary / _warnings / _empty

import type { Tool } from "./types.js";
import type { AggResult, Warnings } from "./aggregator.js";

const TIMESTAMP_FIELDS = new Set([
  "estiblishTime", "approvedTime", "fromTime", "toTime", "updateTimes",
  "cancelDate", "revokeDate",
  "changeTime", "createTime", "subscriptionTime", "paidinTime", "ftShareholding",
  "publishDate", "publishTime", "judgeTime", "submitTime", "submittime",
  "caseRegTime", "caseCreateTime", "filingDate", "endCaseDate",
  "decisionDate", "startDate",
  "appDate", "regDate", "rtm", "eventTime", "pubDate",
  "applicationTime", "regtime", "publishtime",
  "releaseTime", "grantDate", "applicationPublishTime",
  "freezeStartDate", "freezeEndDate", "expiryDate", "issueDate",
  "recordDate", "establishDate", "joinDate",
  "investTime", "time", "pubTime",
  "reportDate", "listingDate", "validFrom", "validTo",
  "occurDate", "checkDate", "startdate", "bidWinDate",
  "noticePeriodStart", "noticePeriodEnd", "evaluationDate",
  "occurTime", "finishDate", "firstPublishDate", "ratingTime",
  "examineDate",
]);

const DATETIME_FIELDS = new Set([
  "updateTimes", "rtm", "pubTime", "eventTime", "startTime",
]);

function pad(n: number): string {
  return n < 10 ? "0" + n : String(n);
}

function formatMs(ms: number, dateTime: boolean): string {
  if (!ms || ms <= 0) return "";
  // 转换到 Asia/Shanghai（UTC+8）
  const shanghai = new Date(ms + 8 * 3600 * 1000);
  const y = shanghai.getUTCFullYear();
  const mo = pad(shanghai.getUTCMonth() + 1);
  const d = pad(shanghai.getUTCDate());
  if (!dateTime) return `${y}-${mo}-${d}`;
  const h = pad(shanghai.getUTCHours());
  const mi = pad(shanghai.getUTCMinutes());
  const s = pad(shanghai.getUTCSeconds());
  return `${y}-${mo}-${d} ${h}:${mi}:${s}`;
}

function formatTimestampsInPlace(v: unknown): void {
  if (v === null || v === undefined) return;
  if (Array.isArray(v)) {
    for (const item of v) formatTimestampsInPlace(item);
    return;
  }
  if (typeof v === "object") {
    const obj = v as Record<string, unknown>;
    for (const [k, val] of Object.entries(obj)) {
      if (TIMESTAMP_FIELDS.has(k) && typeof val === "number" && val > 0) {
        obj[k] = formatMs(val, DATETIME_FIELDS.has(k));
        continue;
      }
      if (TIMESTAMP_FIELDS.has(k) && typeof val === "string" && /^\d{10,13}$/.test(val)) {
        const n = Number(val);
        obj[k] = formatMs(n, DATETIME_FIELDS.has(k));
        continue;
      }
      formatTimestampsInPlace(val);
    }
  }
}

function summaryCount(count: number, label: string): string {
  return `该查询实体共有${count}条${label}记录。`;
}
function summaryCountTruncated(total: number, returned: number, label: string): string {
  return `该查询实体共有${total}条${label}记录。已为您展示前${returned}条。`;
}
function summaryEmpty(label: string): string {
  return `已全量扫描该主体${label}数据库，未发现任何记录。`;
}
function summaryEmptyRisk(name: string, label: string): string {
  return `经天眼查底层数据库全量核查实体 ${name}，当前未发现任何【${label}】记录。此项核心合规风控排查安全，允许进入下一步审计。`;
}

export function applyTransformer(tool: Tool, results: AggResult, warnings: Warnings): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  // 1. 按 sources 顺序合并
  const singleSource = tool.sources.length <= 1;
  for (const src of tool.sources) {
    const r = results[src.scope];
    if (!r) continue;
    if (singleSource || src.scope === "root") {
      for (const [k, v] of Object.entries(r)) out[k] = v;
    } else {
      for (const [k, v] of Object.entries(r)) out[k] = v;
      out["_" + src.scope] = r;
    }
  }
  // 2. 时间戳格式化
  formatTimestampsInPlace(out);
  // 3. 元数据
  if (Object.keys(warnings).length > 0) out._warnings = warnings;
  const items = Array.isArray(out.items) ? (out.items as unknown[]) : null;
  if (items && items.length === 0) out._empty = true;
  if (tool.summary) {
    const name = typeof out.name === "string" ? out.name : "";
    const count = items ? items.length : 0;
    const label = tool.summary.label;
    switch (tool.summary.template) {
      case "count":
        out._summary = count > 0 ? summaryCount(count, label) : summaryEmpty(label);
        break;
      case "count_truncated": {
        let total = count;
        if (typeof out.total === "number" && out.total > 0) total = out.total;
        out._summary = count > 0 ? summaryCountTruncated(total, count, label) : summaryEmpty(label);
        break;
      }
      case "empty_risk":
        out._summary = count > 0 ? summaryCount(count, label) : summaryEmptyRisk(name, label);
        break;
      case "empty_generic":
      default:
        out._summary = count > 0 ? summaryCount(count, label) : summaryEmpty(label);
        break;
    }
  }
  return out;
}
