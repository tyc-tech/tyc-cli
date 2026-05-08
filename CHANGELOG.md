# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 规范，版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [0.4.0] - 2026-05-03

### 新增

- **输出格式三选一**（互斥优先级 `--md` > `--compact` > `--pretty` / 默认）：
  - `--compact`：紧凑单行 JSON（旧默认行为；管道 / `jq` 场景）
  - 默认改为缩进 2 空格 JSON（pretty），人/Agent 通用
  - `--pretty`：同默认；保留 flag 以保持向后兼容 / 显式声明意图
  - `--md`：Markdown 表格（人类阅读 / Agent 上屏；自动渲染 `_summary` / 元数据 / `items` 表格）
- **截断与落盘**（与输出格式正交，可叠加任意子命令）：
  - `--head [N]`（默认 50）：仅打印前 N 行；与 `--tail` 同时给则同时输出两端
  - `--tail [M]`（默认 20）：仅打印后 M 行
  - `--full`：强制完整输出（最高优先级，覆盖 `--head/--tail/--threshold`）
  - `--threshold <BYTES>`（默认 5000）：**字节截断主开关**——超过该字节数从头按字节截断；**不传则永不截断**；与 `--head/--tail` 同时给则按字节截，行参数被忽略
  - `--output-file <PATH>`：把完整结果写入指定路径；**必须显式指定才落盘**（不传则永不落盘）
  - 截断/落盘提示打到 stderr，stdout 保持纯净数据流，便于管道与 `jq` 处理

### 变更

- 默认 stdout 由紧凑单行 JSON 改为缩进 2 空格 JSON。需要旧默认行为的脚本请显式加 `--compact`

## [0.3.0] - 2026-04-29

### 新增

- **分层发现入口**：`tyc layers` / `tyc L0 list` / `tyc L1 list` / `tyc L2 list`，支持 `--md` / `--json`
- 每个 tool 的 `tyc ... --help` 标题带 `[L0]/[L1]/[L2]` 徽章，让 Agent 先看结构、后发一次 `tools/call`

## [0.2.0] - 2026-04-27

### 架构重构

- **CLI 改为 MCP 客户端**：不再直连 tyc OpenAPI，所有工具调用走天眼查 MCP Server
  `https://mcp.tianyancha.com/v1`（默认），`--url` 可覆盖到自建 MCP
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

- `tyc init --url <url>`：配置 MCP endpoint（默认 `https://mcp.tianyancha.com/v1`）
- `tyc init --header K=V`（可重复）：注入自定义 HTTP header
- `tyc init --clear-session`：显式清理本地 session 缓存
- `TYC_MCP_ENDPOINT` / `TYC_AUTHORIZATION` 环境变量覆盖

### 保留

- `tyc <group> <method>` 命令形态与 0.1.0 完全一致
- `--pretty / --md / --verbose` 三种输出模式
- tyc 英文 key 透传（由 MCP Server 保证）
- 6 分类 / 162 工具全量覆盖

## [0.1.0] - 2026-04-25

首发版本：CLI 直连 tyc OpenAPI 的初始实现。
