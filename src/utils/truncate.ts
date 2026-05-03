// 输出截断 / 落盘工具
//
// 设计原则（与用户对齐）：
//   1. --threshold 是截断逻辑的"主开关"。**没有 --threshold 时永不按字节截断**。
//   2. --head N / --tail M 各自显式生效，互不依赖；同时给则同时输出两端。
//      head/tail 是 line-based、对人类可读输出（pretty / md / compact）都适用。
//   3. --threshold 与 --head/--tail 同时出现时按"从头按字节截"语义优先（用户原话），
//      避免用户的字节预算被行截断绕过。
//   4. --full 最高优先级：永远输出完整内容；仍可与 --output-file 共存（落盘 + 全量打印）。
//   5. **不指定 --output-file 永不落盘**（用户明确要求）。
//
// 渲染顺序：先决定 mode（md / pretty / compact），渲染成字符串后送入 truncate；
// 落盘永远写"渲染后的字符串"，与 stdout 看到的同源，便于 diff / 复盘。

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

export interface TruncateOpts {
  /** --full：强制全量输出；最高优先级 */
  full?: boolean;
  /** --head N：行数；undefined 表示用户未指定 */
  head?: number;
  /** --tail M：行数；undefined 表示用户未指定 */
  tail?: number;
  /** --threshold N：字节阈值；undefined 表示用户未指定，永不截断 */
  threshold?: number;
  /** --output-file <path>：落盘路径；undefined 表示用户未指定，永不落盘 */
  outputFile?: string;
}

export interface TruncateResult {
  /** 实际输出到 stdout 的字符串（截断后的可视片段） */
  rendered: string;
  /** 落盘的绝对路径；undefined 表示未落盘 */
  fileWritten?: string;
  /** 给 stderr 的提示行（截断说明 / 落盘路径），调用方负责打印 */
  notices: string[];
}

const HEAD_DEFAULT = 50;
const TAIL_DEFAULT = 20;
const THRESHOLD_DEFAULT = 5000;

/**
 * 解析 commander 接收到的可选值参数：
 *   - undefined：用户未指定该 flag
 *   - true：用户指定了 flag 但未给值（commander `[n]` 语法）→ 用 fallback
 *   - string：用户指定了具体值 → parseInt
 *   - 非法值 → fallback（保持宽容；CLI 不该因为 --head abc 直接崩）
 */
export function resolveOptionalInt(
  raw: unknown,
  fallback: number,
): number | undefined {
  if (raw === undefined) return undefined;
  if (raw === true || raw === "" ) return fallback;
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** Buffer 字节数（与 stdout 实际字节数一致；JS .length 是 UTF-16 code units，会高估纯 ASCII / 低估中文） */
function byteLen(s: string): number {
  return Buffer.byteLength(s, "utf8");
}

/**
 * 按字节截到 ≤ maxBytes，且回退到 UTF-8 字符边界（避免半个汉字）。
 * 我们只截 head 端（用户原话："直接从头到尾按字节数量来截断"）。
 */
function truncateByBytes(s: string, maxBytes: number): string {
  const buf = Buffer.from(s, "utf8");
  if (buf.length <= maxBytes) return s;
  let end = maxBytes;
  // UTF-8 续字节模式 10xxxxxx：往回退到上一个起始字节
  while (end > 0 && (buf[end] & 0xc0) === 0x80) end--;
  return buf.subarray(0, end).toString("utf8");
}

function truncateByLines(
  s: string,
  head: number | undefined,
  tail: number | undefined,
): { out: string; truncated: boolean; total: number } {
  const lines = s.split("\n");
  const total = lines.length;
  if (head === undefined && tail === undefined) {
    return { out: s, truncated: false, total };
  }
  const h = head ?? 0;
  const t = tail ?? 0;
  if (h + t >= total) {
    return { out: s, truncated: false, total };
  }
  const omitted = total - h - t;
  const parts: string[] = [];
  if (head !== undefined) parts.push(...lines.slice(0, h));
  if (head !== undefined && tail !== undefined) {
    parts.push(`... (省略中间 ${omitted} 行) ...`);
    parts.push(...lines.slice(-t));
  } else if (head !== undefined) {
    parts.push(`... (省略后续 ${omitted} 行) ...`);
  } else if (tail !== undefined) {
    parts.push(`... (省略前 ${omitted} 行) ...`);
    parts.push(...lines.slice(-t));
  }
  return { out: parts.join("\n"), truncated: true, total };
}

function writeDump(absPath: string, content: string): void {
  const dir = dirname(absPath);
  mkdirSync(dir, { recursive: true });
  writeFileSync(absPath, content, { encoding: "utf8" });
}

/**
 * 按用户语义对渲染好的字符串做截断 / 落盘。
 *
 * 决策树（每条分支互斥）：
 *   1. --output-file 给了 → 落盘（写"全量"原文，与 stdout 截断版本无关）
 *   2. --full → stdout 全量
 *   3. --threshold 给了：
 *        size > threshold → 字节截到 threshold（head 端）
 *        size ≤ threshold → 全量
 *      （此分支下 --head/--tail 被忽略，符合"从头按字节截断"语义）
 *   4. --head 或 --tail 给了（且无 --threshold）→ line-based 头/尾/头+尾截断
 *   5. 都没给 → 全量
 */
export function applyTruncation(
  rendered: string,
  opts: TruncateOpts,
): TruncateResult {
  const notices: string[] = [];
  let fileWritten: string | undefined;

  // 1. 落盘永远写全量
  if (opts.outputFile && opts.outputFile.length > 0) {
    const abs = resolve(opts.outputFile);
    try {
      writeDump(abs, rendered);
      fileWritten = abs;
      notices.push(`已写入完整结果到 ${abs}（${byteLen(rendered)} 字节）`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      notices.push(`⚠️ --output-file 写入失败：${msg}（继续打印 stdout）`);
    }
  }

  // 2. --full 最高优先级
  if (opts.full) {
    return { rendered, fileWritten, notices };
  }

  // 3. --threshold 主导：字节截
  if (opts.threshold !== undefined) {
    const size = byteLen(rendered);
    if (size > opts.threshold) {
      const cut = truncateByBytes(rendered, opts.threshold);
      const omitted = size - byteLen(cut);
      const tail =
        `\n... (已按 --threshold=${opts.threshold} 字节截断，省略尾部约 ${omitted} 字节) ...`;
      notices.push(
        `输出被 --threshold=${opts.threshold} 截断（原始 ${size} 字节 → 输出 ${byteLen(cut)} 字节）` +
          (fileWritten ? `；完整内容见 ${fileWritten}` : "；如需完整内容追加 --output-file <path>"),
      );
      return { rendered: cut + tail, fileWritten, notices };
    }
    return { rendered, fileWritten, notices };
  }

  // 4. line-based head/tail（无 --threshold）
  if (opts.head !== undefined || opts.tail !== undefined) {
    const r = truncateByLines(rendered, opts.head, opts.tail);
    if (r.truncated) {
      const segs: string[] = [];
      if (opts.head !== undefined) segs.push(`head=${opts.head}`);
      if (opts.tail !== undefined) segs.push(`tail=${opts.tail}`);
      notices.push(
        `输出被 ${segs.join(" / ")} 截断（原始 ${r.total} 行）` +
          (fileWritten ? `；完整内容见 ${fileWritten}` : "；如需完整内容追加 --output-file <path>"),
      );
    }
    return { rendered: r.out, fileWritten, notices };
  }

  // 5. 无任何截断 flag
  return { rendered, fileWritten, notices };
}

export const TRUNCATE_DEFAULTS = {
  HEAD: HEAD_DEFAULT,
  TAIL: TAIL_DEFAULT,
  THRESHOLD: THRESHOLD_DEFAULT,
} as const;
