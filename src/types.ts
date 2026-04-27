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

export interface CatalogTool {
  name: string;          // MCP tool 原名（如 get_actual_controller）
  group: string;         // company / risk / ...
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

export interface Catalog {
  version: string;
  categories: CatalogCategory[];
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
