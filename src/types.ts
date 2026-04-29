// 共享类型定义
//
// CLI 运行时模型：
//  - Catalog：构建时由 apimcp 主仓生成，打包在 src/catalog.json，用于构建命令树
//  - MCP 层类型：JSON-RPC 请求/响应、tools/call 结果
//  - Session：本地缓存的 MCP 会话状态（~/.tyc/session.json）
//  - Config：CLI 配置（~/.tyc/config.json），与主流 MCP 客户端配置风格一致
//    { url, headers }

export interface CatalogParam {
  name: string;
  type: string;
  required?: boolean;
  description: string;
}

// Tool 分层标签（对齐 docs/t1_1/tool-layers.md）
// L0: 实体锚定层（1 个） — search_companies；用户输入(简称/曾用名/模糊) → 精确企业（USCC + 别名 + 状态）。Agent 第 0 跳：不解决"是哪家"，下游全是漂的。
// L1: 概要层（6 个，1 facet × 1 队长）— company-base / 风险 / 知产 / 经营信用 / 历史 / 董监高 各 1 个总览队长，单次调用聚合该 facet 多子维度。
// L2: 明细层（60 个） — 一级数据维度展开（股权 / 诉讼 / 年报 / 知识产权 / 人员任职 …）；L1 _summary 指示后的第 2 跳。
// L3: 专业层（100 个） — ID 详情 / search_* / 上市/私募/建筑/人员微查询；L2 列表条目的最终展开或垂直 SKILL 激活。
export type ToolLayer = "L0" | "L1" | "L2" | "L3";

export interface CatalogTool {
  name: string;          // MCP tool 原名（如 get_actual_controller）
  group: string;         // company / risk / ...
  layer: ToolLayer;      // L0 / L1 / L2
  cliMethod: string;     // tyc <group> <cliMethod>
  categoryNameZh: string;
  description: string;
  params?: CatalogParam[];
}

export interface CatalogCategory {
  group: string;
  name_zh: string;
  tool_count: number;
}

export interface CatalogLayerSummary {
  layer: ToolLayer;
  count: number;
}

export interface Catalog {
  version: string;
  categories: CatalogCategory[];
  layers: CatalogLayerSummary[];
  tools: CatalogTool[];
}

// ~/.tyc/config.json
export interface TycConfig {
  url?: string;
  headers?: Record<string, string>;
}

// ~/.tyc/session.json
export interface TycSession {
  url: string;                  // 对应 config.url；变化即失效
  sessionId: string;            // Mcp-Session-Id
  initializedAt: number;        // epoch ms
  protocolVersion?: string;
}

// MCP JSON-RPC 相关
export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: unknown;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcResponse<T = unknown> {
  jsonrpc: "2.0";
  id: number | string;
  result?: T;
  error?: JsonRpcError;
}

export interface McpContent {
  type: string;
  text?: string;
  [k: string]: unknown;
}

export interface McpToolCallResult {
  content?: McpContent[];
  isError?: boolean;
  structuredContent?: unknown;
  [k: string]: unknown;
}
