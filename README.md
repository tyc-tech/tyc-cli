# tyc-cli

> 天眼查 MCP 命令行工具 —— 为人类与 AI Agent 而生的企业数据查询利器

[![npm version](https://img.shields.io/npm/v/tyc-cli.svg)](https://www.npmjs.com/package/tyc-cli)
[![npm download](https://img.shields.io/npm/dm/tyc-cli.svg)](https://www.npmjs.com/package/tyc-cli)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node ≥ 18](https://img.shields.io/badge/node-%E2%89%A518-brightgreen.svg)](#-环境准备)

---

## 📖 项目简介

`tyc-cli` 是天眼查 MCP Server 的官方命令行客户端。CLI 通过 shared core HTTP 入口
调用天眼查 162 个业务语义聚合工具，覆盖企业工商、知产、司法风险、董监高等全维度
商业数据。

当前 MCP Server 的 `tools/list` 默认只公开少量 AI Agent 入口工具
（搜索、公司画像、能力目录、`call_tool` / `call_tools_batch` 等），但 162 个业务语义
工具仍注册在服务端并保持 `tools/call` 兼容。CLI 不依赖 `tools/list` 构建命令树，
而是使用打包内 `catalog.json` 直达这些业务工具。

**核心特点**：

- 🧠 **Shared Core 客户端架构**：CLI 只做命令解析与参数透传；多源合并、时间戳格式化、
  空结果归一化、`_summary` 注入等业务逻辑由 MCP Server 完成
- 🔌 **公网优先**：默认连接天眼查 MCP 端点 `https://mcp.tianyancha.com/mcp`；
  支持 `--url` 指向本地或私有部署
- 🔄 **无本地 MCP Session**：CLI 调用 stateless shared core endpoint，不缓存 `Mcp-Session-Id`
- 🎯 **6 大业务分类 / 162 个工具**：企业基础信息 · 风险合规 · 知识产权 · 经营与公示 · 历史信息 · 董监高
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
# 连接官方 MCP（默认）：浏览器 OAuth 登录
tyc login

# 连接预发 / 本地 / 自建 MCP
tyc login --url "https://ai-mcp-pre.tianyancha.com/mcp"
tyc login --url "http://localhost:8080/mcp" --issuer "http://localhost:8080/oauth"

# 非阻塞 OAuth：打印授权 URL 和 6 位验证码；网页授权后恢复登录
tyc login --no-block
tyc login --resume

# API key 兼容路径：已有天眼查 OpenAPI token 时可直接写入
tyc init --authorization "YOUR_API_TOKEN"

# 仅写配置、不校验（离线环境或先配好稍后上线）
tyc init --authorization "YOUR_API_TOKEN" --no-verify
```

> `tyc login` 会从 MCP protected-resource metadata 发现 OAuth 授权服务器，启动本地
> loopback 回调，使用 PKCE 授权码流程打开浏览器登录；成功后自动把
> `Authorization: Bearer <access_token>` 和 refresh token 上下文写入
> `~/.tyc/config.json`。后续业务命令会在 access token 临期时自动刷新；
> 如果服务端返回 401，会强制刷新一次并重试当前请求。
> `tyc login --no-block` 使用 OAuth Device Flow，打印授权 URL 和 6 位验证码后立即退出，
> 并把一次性 `device_code` 保存到 `~/.tyc/oauth_pending.json`。在网页输入验证码并确认授权后，
> 执行 `tyc login --resume` 完成换 token。旧版 `tyc login --callback-token "<...>"` 仍保留作兼容入口。
> `tyc init --authorization` 保存配置后会立即校验 shared core auth ready；通过后输出与
> OAuth 登录一致的登录成功提示。失败则退出码 1 并提示配置校验问题。
> 加 `--no-verify` 可跳过校验。

配置存于 `~/.tyc/config.json`（权限 600）：

```json
{
  "url": "https://mcp.tianyancha.com/mcp",
  "headers": {
    "Authorization": "Bearer <OAuth_ACCESS_TOKEN>"
  },
  "oauth": {
    "tokenEndpoint": "https://ai.tianyancha.com/oauth/token",
    "clientId": "<OAUTH_CLIENT_ID>",
    "refreshToken": "<OAUTH_REFRESH_TOKEN>",
    "resource": "https://mcp.tianyancha.com/mcp",
    "accessTokenExpiresAt": 1760000000000
  }
}
```

`tyc init --authorization <token>` 会切回 API key 兼容路径，并清除 `oauth` 刷新上下文。

### 4. 开始查询

```bash
tyc company companies "北京百度网讯科技有限公司" --head 40
tyc company capabilities 2319755677 --company-name "北京百度网讯科技有限公司"
tyc company registration-info "北京百度网讯科技有限公司"
tyc risk dishonest-info "..." --md
tyc executive personnel-dishonest "..." --humanName "张三"
```

---

## 📖 命令手册

### 基础命令

| 命令 | 说明 |
|------|------|
| `tyc login` | 浏览器 OAuth 登录；自动发现 metadata、使用 PKCE 获取 access token / refresh token 并写入配置 |
| `tyc login --no-block` | 打印 Device Flow 授权 URL 和 6 位验证码并立即退出 |
| `tyc login --resume` | 网页输入验证码并确认授权后，使用本地 pending device_code 换取 access token |
| `tyc login --callback-token <code-or-url>` | 兼容旧版 PKCE 非阻塞登录，把回调 code 换成 access token |
| `tyc login --url <url>` | 对指定 MCP endpoint 发起 OAuth 登录 |
| `tyc init --authorization <token>` | 写入 `headers.Authorization`；保存后会立即校验 shared core 连通性 |
| `tyc init --url <url>` | 设置 MCP endpoint |
| `tyc init --header K=V` | 注入自定义 header（可重复）；值留空则删除该 key |
| `tyc init --no-verify` | 仅写配置，跳过连通性校验（离线配置场景） |
| `tyc --help` | 显示 6 个分类总览 |
| `tyc <category> --help` | 显示某分类下全部命令 |
| `tyc <category> <method> --help` | 显示具体命令的入参说明 |

### 全局选项

#### 输出格式（互斥优先级 `--md` > `--compact` > `--pretty` / 默认）

| 选项 | 说明 |
|------|------|
| _(默认)_ | 缩进 2 空格 JSON（pretty）—— 人/Agent 都好读，已成默认 |
| `--pretty` | 同默认；保留 flag 以保持向后兼容 / 显式声明意图 |
| `--compact` | 紧凑单行 JSON（旧默认行为；管道 / `jq` 场景） |
| `--md` | Markdown 表格化输出（人类阅读 / Agent 上屏） |
| `--verbose` | 打印 shared core 请求详情到 stderr（与上述输出格式正交） |

#### 输出截断 / 落盘（与上述输出格式正交，可叠加任意子命令）

| 选项 | 默认值 | 说明 |
|------|-------:|------|
| `--head [N]` | 50 | 仅打印前 N 行；与 `--tail` 同时给则同时输出两端，否则只输出 head |
| `--tail [M]` | 20 | 仅打印后 M 行；与 `--head` 同时给则同时输出两端 |
| `--full` | false | 强制完整输出（最高优先级，覆盖 `--head/--tail/--threshold`） |
| `--threshold <BYTES>` | 5000 | **字节截断主开关**：超过该字节数则从头按字节截断；**不传则永不截断** |
| `--output-file <PATH>` | — | 把完整结果写入指定路径；**不传则永不落盘**（无自动落盘） |

> ⚠️ **截断决策树（与 stdout / 落盘行为）**
>
> 1. `--output-file` 给了 → 落盘永远写**完整**结果（与 stdout 是否截断无关）
> 2. `--full` 最高优先级 → stdout 也输出完整
> 3. 否则若 `--threshold N` 给了：超过 N 字节从头按字节截；**此模式下 `--head/--tail` 被忽略**
> 4. 否则若 `--head/--tail` 任一给了 → 行级截断
> 5. 否则 → 无截断、无落盘
>
> 截断与落盘的提示信息（"已写入 …"、"输出被 head=5 截断 …"）打到 stderr，stdout 仍为可程序化解析的纯净数据流。

#### 用法示例

```bash
# 调试时只看头部
tyc company registration-info "百度" --head            # 默认 50 行
tyc company registration-info "百度" --head 10         # 自定义 10 行

# 看头看尾，确认数据起止
tyc company key-personnel "百度" --head 5 --tail 5

# 字节预算控制（适合塞进 LLM context）
tyc risk overview "百度" --threshold 4000

# stdout 简洁 + 完整结果落盘
tyc company equity-tree "百度" --head 30 --output-file ./equity-tree.json

# 强制全量（覆盖以上一切截断）
tyc operation bidding-info "百度" --full

# 管道场景沿用旧紧凑 JSON
tyc company registration-info "百度" --compact | jq .name
```

### 环境变量覆盖

| 变量 | 作用 |
|------|------|
| `TYC_MCP_ENDPOINT` | 临时覆盖 `url`（优先级高于 config.json） |
| `TYC_AUTHORIZATION` | config 中缺省 Authorization 时兜底 |

---

## 📚 查询指令手册

### 企业基础信息（company，49）

```bash
tyc company companies "北京百度网讯科技有限公司"            # 先锚定主体，复制返回 items[*].id
tyc company capabilities 2319755677 --company-name "北京百度网讯科技有限公司"  # 获取可调用 tool_name 白名单
tyc company registration-info "北京百度网讯科技有限公司"   # 工商登记
tyc company actual-controller "..."                       # 实际控制人
tyc company beneficial-owners "..."                       # UBO
tyc company key-personnel "..."                           # 主要人员
tyc company annual-reports "..."                          # 企业年报
tyc company financial-data "..."                          # 财务数据（上市/非上市自动回退）
tyc company accuracy "北京百度网讯科技有限公司" --companyCode "91110000802100433B" --legalPersonName "梁志祥"  # 三要素核验
tyc company equity-tree "..."                             # 股权图谱
tyc company relation-path "A" --searchKey2 "B"            # 双企业最短路径
tyc company group-info "..."                              # 集团信息（serial 串行执行）
```

### 风险合规（risk，35）

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

### 历史信息（history，17）

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
│   tyc-cli   │ ──HTTP──▶│  天眼查 MCP Server           │ ──HTTP──▶│ tyc OpenAPI     │
│ (npm / TS)  │ ◀──JSON──│  (/v1/core/tools/call)       │ ◀───────│                 │
└─────────────┘         └─────────────────────────────┘         └─────────────────┘
       │                              │
       │                              └─ 多源并发聚合 · 时间戳格式化 · _summary 注入 · 空结果归一化
       │
       └─ 仅命令树 · 参数透传 · pretty/--md/--compact 呈现 · --head/--tail/--full/--threshold/--output-file 截断与落盘
```

**CLI 的职责**：

1. 解析命令行（commander）
2. 组装 shared core `/v1/core/tools/call` 请求，透传 `Authorization` header
3. 解析 shared core 响应并包装成统一输出结构
4. 格式化输出（默认 pretty / `--compact` / `--md`），并可叠加 `--head/--tail/--full/--threshold/--output-file` 做截断与落盘

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
    ├── types.ts              # Catalog / tool result 类型
    ├── config.ts             # ~/.tyc/config.json 读写 · 环境变量兜底
    ├── coreClient.ts         # Shared Core HTTP client · ready/auth 校验 · tools/call
    ├── oauth.ts              # OAuth metadata discovery · PKCE · loopback callback
    ├── registry.ts           # 读取打包内 catalog.json（命令树元数据）
    ├── catalog.json          # 命令元数据：name / group / cliMethod / params
    ├── commands/
    │   ├── init.ts           # tyc init
    │   ├── login.ts          # tyc login
    │   └── category.ts       # 动态注册 6 分类 × N 方法
    └── utils/
        ├── jsonToMarkdown.ts # --md 选项的 Markdown 渲染
        └── truncate.ts       # --head/--tail/--full/--threshold/--output-file 截断与落盘
```

---

## ⚙️ Shared Core 调用

CLI 不直接维护 MCP session，也不会写 `~/.tyc/session.json`。所有业务命令统一调用
`/v1/core/tools/call`；`tyc init` 用 `/v1/core/ready` 做连通性校验，`tyc login`
用 `/v1/core/auth/ready` 做鉴权校验。

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
| 协议 | Shared Core HTTP client | MCP server |
| 实现 | TypeScript | Go |
| 职责 | 命令树 · 参数透传 · 格式化输出 | 多源聚合 · 时间戳格式化 · 元数据注入 · Authorization 透传至 OpenAPI |
| 运维 | 用户本地安装 | 默认连接官方托管 `mcp.tianyancha.com`，也可切到本机 apimcp 或用户自建 |

CLI 和 MCP Server 共享同一 162 工具清单；工具元数据从打包内的 `catalog.json`
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

`-o` = `--online`，切到 `https://mcp.tianyancha.com/mcp`；`-v` = `--verbose`。
单分类脚本加 `-p` 可独立触发 preflight：`bash test/t1_1/cli/test_company.sh -p -o`。

---

## 🤝 贡献

欢迎 Issue / PR！CLI 代码改动主要集中在 `src/`，工具清单由 MCP Server 侧 SSOT
同步生成（`catalog.json`）。如果你发现命令树与服务端实际工具集不一致，提 Issue 即可。

---

## 📄 开源协议

本项目采用 [MIT License](LICENSE)。

数据来源：天眼查 OpenAPI（用户需自行获取并合规使用 token）。本工具不存储、不转发、不解析用户的查询数据，所有调用经天眼查 MCP Server 转发。
