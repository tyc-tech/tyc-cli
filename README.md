# tyc-cli

> 天眼查 MCP 命令行工具 —— 为人类与 AI Agent 而生的企业数据查询利器

[![npm version](https://img.shields.io/npm/v/tyc-cli.svg)](https://www.npmjs.com/package/tyc-cli)
[![npm download](https://img.shields.io/npm/dm/tyc-cli.svg)](https://www.npmjs.com/package/tyc-cli)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node ≥ 18](https://img.shields.io/badge/node-%E2%89%A518-brightgreen.svg)](#-环境准备)

---

## 📖 项目简介

`tyc-cli` 是天眼查 MCP Server 的官方命令行客户端。通过 MCP 协议（JSON-RPC 2.0 over
Streamable HTTP）调用天眼查 163 个业务语义聚合工具，覆盖企业工商、知产、司法风险、
董监高等全维度商业数据。

**核心特点**：

- 🧠 **MCP 客户端架构**：CLI 只做协议转换与参数透传；多源合并、时间戳格式化、
  空结果归一化、`_summary` 注入等业务逻辑由 MCP Server 完成
- 🔌 **即插即用**：默认连接官方 MCP 端点 `https://mcp.tianyancha.com/v1`；
  支持 `--url` 指向私有部署
- 🔄 **Session 复用**：`Mcp-Session-Id` 本地缓存 24 小时，后续调用零 initialize 开销
- 🎯 **6 大业务分类 / 163 个工具**：企业基础信息 · 风险合规 · 知识产权 · 经营与公示 · 历史信息 · 董监高
- 🤖 **AI Agent 友好**：tyc 英文 key 透传 / 时间戳格式化 / `_summary / _empty / _warnings` 元数据

---

## 🚀 快速开始

### 1. 环境准备

- **Node.js** ≥ 18.0.0（推荐 LTS）
- **天眼查 API Token**：联系天眼查商务获取或自行注册

### 2. 安装

```bash
# 全局安装（推荐）
npm install -g tyc-cli

# 或源码安装
git clone https://github.com/tyc-tech/tyc-cli.git
cd tyc-cli
npm install && npm run build && npm link
```

### 3. 初始化配置

```bash
# 连接官方 MCP（默认）
tyc init --authorization "YOUR_API_TOKEN"

# 连接自建 MCP
tyc init --authorization "YOUR_API_TOKEN" --url "http://your-mcp-host:8080/v1"

# 仅写配置、不校验（离线环境或先配好稍后上线）
tyc init --authorization "YOUR_API_TOKEN" --no-verify
```

> `tyc init` 保存配置后会立即向 MCP 发一次 `initialize`：成功则打印 `已建立 MCP session`，
> 失败则退出码 1 并提示连通性问题。加 `--no-verify` 可跳过校验。

配置存于 `~/.tyc/config.json`（权限 600）：

```json
{
  "url": "https://mcp.tianyancha.com/v1",
  "headers": {
    "Authorization": "YOUR_API_TOKEN"
  }
}
```

### 4. 开始查询

```bash
tyc company registration-info "北京百度网讯科技有限公司"
tyc risk dishonest-info "..." --md
tyc executive personnel-dishonest "..." --humanName "张三"
```

---

## 📖 命令手册

### 基础命令

| 命令 | 说明 |
|------|------|
| `tyc init --authorization <token>` | 写入 `headers.Authorization`；保存后会立即向 MCP 发一次 `initialize` 校验连通性 |
| `tyc init --url <url>` | 设置 MCP endpoint |
| `tyc init --header K=V` | 注入自定义 header（可重复）；值留空则删除该 key |
| `tyc init --no-verify` | 仅写配置，跳过连通性校验（离线配置场景） |
| `tyc init --clear-session` | 清除本地 session 缓存 |
| `tyc --help` | 显示 6 个分类总览 |
| `tyc <category> --help` | 显示某分类下全部命令 |
| `tyc <category> <method> --help` | 显示具体命令的入参说明 |

### 全局选项

| 选项 | 说明 |
|------|------|
| `--pretty` | 缩进 2 空格 JSON 输出（调试友好） |
| `--md` | Markdown 表格化输出（人类阅读 / Agent 上屏） |
| `--verbose` | 打印 MCP 请求详情到 stderr（URL / Mcp-Session-Id / 掩码 Authorization / 响应原文） |

三种输出互斥优先级：`--md > --pretty > 默认`。

### 环境变量覆盖

| 变量 | 作用 |
|------|------|
| `TYC_MCP_ENDPOINT` | 临时覆盖 `url`（优先级高于 config.json） |
| `TYC_AUTHORIZATION` | config 中缺省 Authorization 时兜底 |

---

## 📚 查询指令手册

### 企业基础信息（company，50）

```bash
tyc company registration-info "北京百度网讯科技有限公司"   # 工商登记
tyc company actual-controller "..."                       # 实际控制人
tyc company beneficial-owners "..."                       # UBO
tyc company key-personnel "..."                           # 主要人员
tyc company annual-reports "..."                          # 企业年报
tyc company financial-data "..."                          # 财务数据（上市/非上市自动回退）
tyc company accuracy "..." --legalPersonName "梁志祥"     # 三要素核验
tyc company equity-tree "..."                             # 股权图谱
tyc company relation-path "A" --searchKey2 "B"            # 双企业最短路径
tyc company group-info "..."                              # 集团信息（serial 串行执行）
```

### 风险合规（risk，36）

```bash
tyc risk dishonest-info "..."                  # 失信被执行
tyc risk judgment-debtor-info "..."            # 被执行人
tyc risk high-consumption-restriction "..."    # 限高
tyc risk administrative-penalty "..."          # 行政处罚
tyc risk bankruptcy-reorganization "..."       # 破产重整
tyc risk overview "..."                        # 综合风险总览
tyc risk judicial-case "..."                   # 司法解析
```

### 知识产权（intellectual_property，14）

```bash
tyc intellectual_property patent-info "..."
tyc intellectual_property trademark-info "..."
tyc intellectual_property software-copyright-info "..."
tyc intellectual_property ipr-score "..."                         # 创新力评分
tyc intellectual_property search-patents "新能源" --applicant "宁德时代"
tyc intellectual_property construction-qualifications "..."       # 建筑资质
```

### 经营与公示（operation，32）

```bash
tyc operation bidding-info "..."
tyc operation qualifications "..."
tyc operation administrative-license "..."
tyc operation news-sentiment "..."
tyc operation recruitment-info "..."
tyc operation invest-agency-profile "红杉资本"         # 投资机构
tyc operation private-fund-profile "..."               # 私募基金
```

### 历史信息（history，18）

```bash
tyc history historical-registration "..."
tyc history historical-shareholders "..."
tyc history historical-judicial-docs "..."
tyc history historical-overview "..."
```

### 董监高（executive，15） · 双参数实体强锚定

```bash
tyc executive personnel-dishonest "..." --humanName "张三"
tyc executive person-profile "..." --humanName "张三"
tyc executive person-partners "..." --humanName "张三"
tyc executive person-risk-overview "..." --humanName "张三"
```

完整命令清单：`tyc <category> --help`。

---

## 🏗️ 架构

```
┌─────────────┐         ┌─────────────────────────────┐         ┌─────────────────┐
│   tyc-cli   │ ──JSON──▶│  天眼查 MCP Server           │ ──HTTP──▶│ tyc OpenAPI     │
│ (npm / TS)  │ ◀───RPC──│  (mcp.tianyancha.com/v1) │ ◀───────│                 │
└─────────────┘         └─────────────────────────────┘         └─────────────────┘
       │                              │
       │                              └─ 多源并发聚合 · 时间戳格式化 · _summary 注入 · 空结果归一化
       │
       └─ 仅命令树 · 参数透传 · Session 管理 · --md/--pretty 呈现
```

**CLI 的职责**：

1. 解析命令行（commander）
2. 组装 `tools/call` JSON-RPC 请求，透传 `Authorization` header
3. Session 管理（`initialize` + 24h 缓存 + 失效重建）
4. 解析 MCP Streamable HTTP 响应（纯 JSON 或 SSE）
5. 格式化输出（紧凑 JSON / `--pretty` / `--md`）

**CLI 不做**：

- 不解析 Authorization，不验签，不计费
- 不合并多源，不做时间戳格式化
- 不生成 `_summary` / `_empty` / `_warnings`（由 MCP Server 注入）
- 不缓存业务结果

---

## 📂 目录结构

```
tyc-cli/
├── package.json              # bin: tyc · entry: dist/index.js
├── tsconfig.json
├── LICENSE                   # MIT
├── README.md                 # 本文件
├── CHANGELOG.md
│
└── src/
    ├── index.ts              # CLI 入口（commander 注册）
    ├── types.ts              # Catalog / Session / MCP 类型
    ├── config.ts             # ~/.tyc/config.json 读写 · 环境变量兜底
    ├── session.ts            # ~/.tyc/session.json 读写 · 24h TTL
    ├── mcpClient.ts          # MCP JSON-RPC client · SSE 解析 · 失效重建
    ├── registry.ts           # 读取打包内 catalog.json（命令树元数据）
    ├── catalog.json          # 命令元数据：name / group / cliMethod / params
    ├── commands/
    │   ├── init.ts           # tyc init
    │   └── category.ts       # 动态注册 6 分类 × N 方法
    └── utils/
        └── jsonToMarkdown.ts # --md 选项的 Markdown 渲染
```

---

## ⚙️ Session 管理

| 场景 | 行为 |
|------|------|
| 首次调用 | `initialize` → 读 `Mcp-Session-Id` header → 存 `~/.tyc/session.json` |
| 24h 内复用 | 直接用缓存 `sessionId`，跳过 `initialize` |
| 缓存过期（>24h） | 自动 re-initialize，用户无感 |
| 服务端主动失效（404/410/"session not found"） | 删缓存 → 重建 → 重试 1 次 |
| `tyc init` 变更 url / Authorization | 配置写入后自动清掉旧 session |

`~/.tyc/session.json` 示例：

```json
{
  "url": "https://mcp.tianyancha.com/v1",
  "sessionId": "mcp-session-xxx",
  "initializedAt": 1777272039739,
  "protocolVersion": "2024-11-05"
}
```

---

## 📋 错误码

| 退出码 | 含义 | 处理建议 |
|-------|------|---------|
| 0 | 成功 | — |
| 1 | 请求失败 / 配置缺失 / 业务错误 | 查 stderr；常见：未 `tyc init`、MCP 不可达、tyc 无权限 |

下游 tyc OpenAPI 错误码（由 MCP Server 归一化后呈现）：

| error_code | CLI 表现 |
|-----------|---------|
| 0 | 正常输出 |
| 300000（经查无结果） | 成功退出 + `{items: [], total: 0, _empty: true}` + `_summary` |
| 300005（无权限） | 透传错误 + exit 1 |
| 其他 | 透传错误 + exit 1 |

---

## 🔁 与 MCP Server 的关系

| 维度 | `tyc-cli` | 天眼查 MCP Server |
|-----|---------|-------------------|
| 协议 | MCP client（JSON-RPC over Streamable HTTP） | MCP server |
| 实现 | TypeScript | Go |
| 职责 | 命令树 · 参数透传 · 格式化输出 | 多源聚合 · 时间戳格式化 · 元数据注入 · Authorization 透传至 OpenAPI |
| 运维 | 用户本地安装 | 官方托管 `mcp.tianyancha.com`，或用户自建 |

CLI 和 MCP Server 共享同一 163 工具清单；工具元数据从打包内的 `catalog.json`
读取，保证命令树冷启动零网络开销。

---

## 🧪 开发自测

如果你 fork 了本项目做二次开发，可以跑打包内的测试脚本验证：

```bash
# 默认连本地自建 MCP（需要你自己起 apimcp）
bash test/t1_1/cli/run_t1_1.sh

# 打线上官方 MCP（只需要一个有效 Authorization）
bash test/t1_1/cli/run_t1_1.sh -o

# 线上 + 详细日志
bash test/t1_1/cli/run_t1_1.sh -o -v

# 环境变量覆盖
MCP_URL=https://my-mcp.example.com/mcp AUTH_TOKEN=xxx bash test/t1_1/cli/run_t1_1.sh
```

`-o` = `--online`，切到 `https://mcp.tianyancha.com/v1`；`-v` = `--verbose`。
单分类脚本加 `-p` 可独立触发 preflight：`bash test/t1_1/cli/test_company.sh -p -o`。

---

## 🤝 贡献

欢迎 Issue / PR！CLI 代码改动主要集中在 `src/`，工具清单由 MCP Server 侧 SSOT
同步生成（`catalog.json`）。如果你发现命令树与服务端实际工具集不一致，提 Issue 即可。

---

## 📄 开源协议

本项目采用 [MIT License](LICENSE)。

数据来源：天眼查 OpenAPI（用户需自行获取并合规使用 token）。本工具不存储、不转发、不解析用户的查询数据，所有调用经天眼查 MCP Server 转发。
