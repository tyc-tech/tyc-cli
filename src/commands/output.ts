import { jsonToMarkdown } from "../utils/jsonToMarkdown.js";
import {
  applyTruncation,
  resolveOptionalInt,
  TRUNCATE_DEFAULTS,
} from "../utils/truncate.js";
import type { McpToolCallResult } from "../types.js";

export function emitToolResult(
  result: McpToolCallResult,
  opts: Record<string, unknown>,
  toolName: string,
): void {
  if (result.isError) {
    const errText = extractText(result) || "未知业务错误";
    console.error(errText);
    process.exit(1);
  }

  const text = extractText(result);
  if (text === null) {
    console.error("tools/call 返回无可解析内容");
    process.exit(1);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    emitWithTruncation(text.endsWith("\n") ? text.slice(0, -1) : text, opts);
    return;
  }

  let rendered: string;
  if (opts.md) {
    rendered = jsonToMarkdown(payload as Record<string, unknown>, toolName);
  } else if (opts.compact) {
    rendered = JSON.stringify(payload);
  } else {
    rendered = JSON.stringify(payload, null, 2);
  }

  emitWithTruncation(rendered, opts);
}

function emitWithTruncation(rendered: string, opts: Record<string, unknown>): void {
  const head = resolveOptionalInt(opts.head, TRUNCATE_DEFAULTS.HEAD);
  const tail = resolveOptionalInt(opts.tail, TRUNCATE_DEFAULTS.TAIL);
  const threshold = resolveOptionalInt(
    opts.threshold,
    TRUNCATE_DEFAULTS.THRESHOLD,
  );
  const outputFile =
    typeof opts.outputFile === "string" && opts.outputFile.length > 0
      ? opts.outputFile
      : undefined;

  const r = applyTruncation(rendered, {
    full: !!opts.full,
    head,
    tail,
    threshold,
    outputFile,
  });

  console.log(r.rendered);
  for (const n of r.notices) {
    process.stderr.write(n + "\n");
  }
}

function extractText(result: McpToolCallResult): string | null {
  const content = result.content || [];
  for (const c of content) {
    if (typeof c.text === "string" && c.text.length > 0) return c.text;
  }
  return null;
}
