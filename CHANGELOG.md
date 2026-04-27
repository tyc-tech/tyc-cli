# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 规范，版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [0.2.0] - 2026-04-27

### 架构重构

- **CLI 改为 MCP 客户端**：不再直连 tyc OpenAPI，所有工具调用走天眼查 MCP Server
  `https://ai-mcp.tianyancha.com/mcp`（默认），`--url` 可覆盖到自建 MCP
- **移除本地业务逻辑**：多源聚合 / 时间戳格式化 / `_summary` 注入 / 空结果归一化
  全部下沉到 MCP Server 端；CLI 只负责命令树、参数透传、`--md/--pretty` 呈现
- **Session 管理**：首次调用执行 `initialize` 拿 `Mcp-Session-Id`，缓存在
  `~/.tyc/session.json`，TTL 24 小时；过期或失效自动重建重试
- **配置格式升级**：`~/.tyc/config.json` 改为 `{ url, headers }`，与通用 MCP
  客户端配置一致；`Authorization` 写入 `headers.Authorization`，支持自定义 header
- **Catalog 前置构建**：命令树由打包内 `catalog.json`（由 apimcp 主仓生成）构建，
  冷启动零网络调用；内容仅含命令元数据（name/group/cliMethod/params），
  不含服务端实现细节

### 新增

- `tyc init --url <url>`：配置 MCP endpoint（默认 `https://ai-mcp.tianyancha.com/mcp`）
- `tyc init --header K=V`（可重复）：注入自定义 HTTP header
- `tyc init --clear-session`：显式清理本地 session 缓存
- `TYC_MCP_ENDPOINT` / `TYC_AUTHORIZATION` 环境变量覆盖

### 保留

- `tyc <group> <method>` 命令形态与 0.1.0 完全一致
- `--pretty / --md / --verbose` 三种输出模式
- tyc 英文 key 透传（由 MCP Server 保证）
- 6 分类 / 167 工具全量覆盖

## [0.1.0] - 2026-04-25

首发版本：CLI 直连 tyc OpenAPI 的初始实现。
