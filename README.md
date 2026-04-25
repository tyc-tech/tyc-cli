# tyc-agent-cli

> 天眼查 OpenAPI 业务语义层命令行工具 —— 为人类与 AI Agent 而生的企业数据查询利器

[![npm version](https://img.shields.io/npm/v/tyc-agent-cli.svg)](https://www.npmjs.com/package/tyc-agent-cli)
[![npm download](https://img.shields.io/npm/dm/tyc-agent-cli.svg)](https://www.npmjs.com/package/tyc-agent-cli)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node ≥ 18](https://img.shields.io/badge/node-%E2%89%A518-brightgreen.svg)](#-环境准备)

---

## 📖 项目简介

`tyc-agent-cli` 是基于天眼查 OpenAPI 的命令行工具，旨在帮助开发者和 AI Agent 快速访问企业工商信息、知识产权、司法风险、董监高画像等全维度商业数据。

**核心能力**：

- 🎯 **15 大业务分类**：企业基础信息 · 风险合规 · 知识产权 · 经营与公示 · 历史信息 · 董监高 · 股权图谱 · 集团信息 · 投资机构 · 私募基金 · 建筑资质 · 企业搜索 · 财务分析 · 企业报告 · 地理与园区
- 🔧 **167 个聚合工具**：每个工具内部自动并发调多个 tyc 原子 API，按业务语义合并输出
- 🤖 **AI Agent 友好**：tyc 英文 key 透传 / 时间戳自动格式化 / 自动注入 `_summary` / `_empty` / `_warnings` 元数据
- 🔒 **安全可控**：Authorization 透传不解析，配置文件本地化，敏感字段不入仓

---

## 🌟 为什么选择 tyc-agent-cli？

### 🤖 为 AI Agent 原生设计

- **tyc 英文 key 透传**：返回值顶层全为 `name` / `items` / `creditCode` / `total` 等英文字段，避免中英混用造成的 LLM 理解抖动
- **时间戳自动格式化**：毫秒时间戳值自动转为 `Asia/Shanghai` 字符串（`yyyy-MM-dd`），key 名不变，便于 Agent 直接消费
- **空结果归一化**：tyc 的 `经查无结果`（error_code 300000）自动归一为 `{items: [], total: 0, _empty: true}` + 友好摘要，便于 Agent 分支判断
- **三种输出格式**：紧凑 JSON / 缩进 JSON (`--pretty`) / Markdown 表格 (`--md`)，适配不同 Agent 上屏需求
- **确定性错误码**：失败/熔断/无权限有清晰区分，可基于退出码自动重试

### 👤 为人类开发者设计

- **简洁命令**：`tyc company registration-info "企业名称"`（自动剥离分类前缀，告别 `tyc company company-registration-info` 冗余）
- **三种输出 mode**：
  - 默认紧凑 JSON：适合 `jq` 管道
  - `--pretty`：缩进 2 空格的 JSON，调试友好
  - `--md`：Markdown 表格，复制即用
- **`--verbose` 调试**：打印 HTTP 请求详情到 stderr，定位问题
- **`tyc --help` / `tyc <分类> --help`**：动态展开 15 分类下的全部命令

### 🏢 为企业级应用设计

- **配置驱动**：统一配置 `~/.tyc/config.json`，支持多环境切换
- **静态命令树**：构建时从 SSOT (`api-registry.yaml`) 生成命令，无需联网自省
- **无状态**：每次调用独立鉴权，可水平扩展用于批处理脚本

### 🚀 零门槛上手

- **3 分钟安装**：`npm install -g tyc-agent-cli`
- **一行命令查询**：无需编写代码，命令行直达数据
- **MIT 协议**：可自由二次开发与商用分发

### 🛡️ 安全可控

- **Authorization 透传**：CLI 不解析、不验签、不上报，原样发给天眼查 OpenAPI
- **配置本地化**：token 仅保存在 `~/.tyc/config.json`，权限 600
- **敏感字段不入仓**：`.gitignore` 排除 `.env` 与本地配置

---

## ⚡ 功能特性

### 15 大业务分类

| 分类 | Go 包名 | 工具数 | 适合场景 |
|------|---------|--------|---------|
| 企业基础信息 | `company` | 19 | 工商核验、股东、年报、财务概览 |
| 风险合规 | `risk` | 36 | 失信、被执行、行政处罚、破产、欠税 |
| 知识产权 | `intellectual_property` | 10 | 专利、商标、软著、知产出质 |
| 经营与公示 | `operation` | 23 | 招投标、资质、许可、舆情、招聘 |
| 历史信息 | `history` | 18 | 历史工商、历史司法、历史投资 |
| 董监高 | `executive` | 15 | 高管个人画像、控制企业、合作伙伴 |
| 股权与关系图谱 | `equity_relation` | 7 | 股权树、最短路径、控股穿透 |
| 集团信息 | `group` | 4 | 集团成员、对外投资、投资方 |
| 投资机构 | `investment_agency` | 5 | 机构画像、被投、管理基金 |
| 私募基金 | `private_fund` | 4 | 基金管理人、产品、诚信 |
| 建筑资质 | `construction_qualification` | 4 | 资质证书、注册人员、工程项目 |
| 企业搜索 | `company_search` | 4 | 关键词、行业地区、标签搜索 |
| 财务分析 | `financial_analysis` | 11 | 三表、股本、股东、董监高、招股书 |
| 企业报告 | `enterprise_report` | 2 | 基础版/专业版信用报告 |
| 地理与园区 | `geography_park` | 5 | 园区、附近公司、经纬度、Logo |

完整工具清单查看：`tyc <category> --help` 或本仓库 [`api-registry.yaml`](api-registry.yaml)。

---

## 🚀 快速开始

### 1. 环境准备

- **Node.js**：≥ 18.0.0（推荐 LTS）
- **天眼查 API Token**：联系天眼查商务获取或自行注册

### 2. 安装工具

```bash
# 全局安装（推荐）
npm install -g tyc-agent-cli

# 或本地安装后 npm link
git clone https://github.com/tianyancha-tech/tyc-agent-cli.git
cd tyc-agent-cli
npm install && npm run build && npm link
```

### 3. 初始化配置

```bash
tyc init --authorization "YOUR_API_TOKEN"
# Authorization 保存在 ~/.tyc/config.json（与 MCP Server 共享）
```

### 4. 开启查询

```bash
# 企业工商信息
tyc company registration-info "北京百度网讯科技有限公司"

# 董监高失信被执行（双参数）
tyc executive personnel-dishonest "北京字节跳动科技有限公司" --humanName "张一鸣"

# Markdown 友好输出
tyc company registration-info "北京百度网讯科技有限公司" --md

# 缩进 JSON 调试
tyc risk dishonest-info "..." --pretty --verbose
```

---

## 📖 命令手册

### 基础管理命令

| 命令 | 说明 |
|------|------|
| `tyc init --authorization <token>` | 配置 Authorization，保存到 `~/.tyc/config.json` |
| `tyc --help` | 显示 15 个分类总览 |
| `tyc <category> --help` | 显示某分类下全部命令 |
| `tyc <category> <method> --help` | 显示具体命令的入参说明 |
| `tyc --version` | 显示当前版本号 |

### 全局选项

| 选项 | 说明 |
|------|------|
| `--pretty` | 缩进 2 空格的 JSON 输出（调试友好） |
| `--md` | Markdown 表格化输出（适合人类阅读 / Agent 上屏） |
| `--verbose` | 输出 HTTP 请求详情到 stderr |

> 三个输出模式互斥优先级：`--md` > `--pretty` > 默认紧凑 JSON。

### 数据查询调用格式

```
tyc <分类> <方法-kebab> <位置参数> [--可选参数 值]
```

- **分类**：15 个 Go 包名（`company` / `risk` / ... / `geography_park`）
- **方法**：自动从 tool name 推导（`get_company_registration_info` → `registration-info`；`get_personnel_dishonest` → `personnel-dishonest`，自动剥离分类前缀）
- **位置参数**：第一个必填参数（通常是 `searchKey`）
- **可选参数**：如 `--humanName`、`--searchKey2`、`--id`、`--applicant` 等

---

## 📚 查询指令手册（节选典型场景）

### 1️⃣ company（企业基础信息，19 个工具）

```bash
# 工商登记基础（多源聚合：ic/baseinfoV2 + ic/companyType）
tyc company registration-info "北京百度网讯科技有限公司"

# 实际控制人
tyc company actual-controller "..."

# 受益所有人 (UBO)
tyc company beneficial-owners "..."

# 主要人员
tyc company key-personnel "..."

# 企业年报
tyc company annual-reports "..."

# 财务数据（5 源聚合：上市优先 stock/* + 非上市回退 ic/annualreport）
tyc company financial-data "..."

# 上市信息
tyc company listing-info "..."

# 三要素核验
tyc company accuracy "..." --legalPersonName "梁志祥"
```

### 2️⃣ risk（风险合规，36 个工具）

```bash
# 失信被执行
tyc risk dishonest-info "..."

# 被执行人
tyc risk judgment-debtor-info "..."

# 限制高消费
tyc risk high-consumption-restriction "..."

# 行政处罚
tyc risk administrative-penalty "..."

# 破产重整
tyc risk bankruptcy-reorganization "..."

# 司法拍卖 / 裁判文书 / 立案信息 / ...

# 综合风险总览
tyc risk overview "..."

# 风险详情（基于 ID）
tyc risk detail "RISK_ID"

# 司法解析
tyc risk judicial-case "..."
```

### 3️⃣ intellectual_property（知识产权，10 个工具）

```bash
# 专利 / 商标 / 软著 / 作品著作权
tyc intellectual_property patent-info "..."
tyc intellectual_property trademark-info "..."
tyc intellectual_property software-copyright-info "..."
tyc intellectual_property copyright-work-info "..."

# 网站备案 + 公众号
tyc intellectual_property internet-service-info "..."

# 创新力评分
tyc intellectual_property ipr-score "..."

# 专利搜索（搜索类）
tyc intellectual_property search-patents "新能源" --applicant "宁德时代"

# 商标详情（基于注册号）
tyc intellectual_property trademark-detail "TM12345"
```

### 4️⃣ operation（经营与公示，23 个工具）

```bash
# 招投标
tyc operation bidding-info "..."

# 资质证书 / 行政许可 / 电信许可
tyc operation qualifications "..."
tyc operation administrative-license "..."
tyc operation telecom-license "..."

# 信用评价（纳税信用 + 债券评级）
tyc operation credit-evaluation "..."

# 融资记录
tyc operation financing-records "..."

# 新闻舆情
tyc operation news-sentiment "..."

# 招聘动态
tyc operation recruitment-info "..."

# 抽查检查 / 双随机抽查
tyc operation spot-check-info "..."
tyc operation random-check "..."
```

### 5️⃣ history（历史信息，18 个工具）

```bash
# 历史工商 / 历史股东 / 历史投资
tyc history historical-registration "..."
tyc history historical-shareholders "..."
tyc history historical-investments "..."

# 历史司法
tyc history historical-judicial-docs "..."
tyc history historical-dishonest "..."
tyc history historical-judgment-debtor "..."

# 历史信息总览
tyc history historical-overview "..."
```

### 6️⃣ executive（董监高 · 双参数实体强锚定，15 个工具）

```bash
# 董监高现状（11 个核心工具）
tyc executive personnel-dishonest "..." --humanName "张三"
tyc executive personnel-judgment-debtor "..." --humanName "张三"
tyc executive personnel-high-consumption-ban "..." --humanName "张三"
tyc executive personnel-controlled-companies "..." --humanName "张三"
tyc executive personnel-related-companies "..." --humanName "张三"

# 历史维度
tyc executive personnel-historical-dishonest "..." --humanName "张三"

# 人员画像深度（4 个 TYC 扩展工具）
tyc executive person-profile "..." --humanName "张三"
tyc executive person-partners "..." --humanName "张三"
tyc executive person-risk-overview "..." --humanName "张三"
tyc executive person-judicial-assistance "..." --humanName "张三"
```

### 7️⃣ equity_relation（股权与关系图谱，7 个工具）

```bash
# 股权树 / 控股穿透 / 总公司
tyc equity_relation equity-tree "..."
tyc equity_relation controlled-companies "..."
tyc equity_relation parent-company "..."

# 关系图谱（一键节点+边）
tyc equity_relation relation-graph "..."

# 双企业最短路径
tyc equity_relation relation-path "企业 A" --searchKey2 "企业 B"

# 股权变更历史
tyc equity_relation shareholder-change "..."
```

### 8️⃣ financial_analysis（财务分析，11 个工具，仅上市公司）

```bash
# 财务三表
tyc financial_analysis income-statement "..."
tyc financial_analysis balance-sheet "..."
tyc financial_analysis cash-flow-statement "..."

# 主要指标 / 简析
tyc financial_analysis financial-summary "..."
tyc financial_analysis financial-main-indicators "..."

# 股本结构 / 十大股东 / 董监高
tyc financial_analysis share-structure "..."
tyc financial_analysis stock-shareholders "..."
tyc financial_analysis stock-executives "..."

# 招股书
tyc financial_analysis stock-prospectus "..."

# 上市公司搜索
tyc financial_analysis search-listed-companies "新能源"
```

### 9️⃣ geography_park（地理与园区，5 个工具）

```bash
# 园区画像 + 入园企业
tyc geography_park park-info "中关村软件园"
tyc geography_park search-park-companies "中关村软件园"

# 经纬度雷达
tyc geography_park nearby-companies 116.391 --latitude 39.907 --radius 1000

# 企业经纬度 / Logo
tyc geography_park company-location "..."
tyc geography_park company-logo "..."
```

> 完整 15 分类的命令清单可通过 `tyc <分类> --help` 实时查看，或浏览 [`api-registry.yaml`](api-registry.yaml)。

---

## ⚙️ 配置说明

### 配置文件路径

```
~/.tyc/config.json
```

### 字段解析

| 字段 | 类型 | 说明 |
|------|------|------|
| `authorization` | string | 天眼查 OpenAPI Token，原样透传到下游 |
| `baseUrl` | string（可选） | 自定义 tyc OpenAPI 域名，默认 `https://open.api.tianyancha.com` |

### 配置命令

```bash
# 设置/更新 Authorization
tyc init --authorization "YOUR_API_TOKEN"

# 手动编辑（不推荐）
vim ~/.tyc/config.json
```

### 安全性提示

- 配置文件权限默认 600（用户只读写）
- token 不入 git，`.gitignore` 已排除常见敏感路径
- `--verbose` 模式下，token 在日志中以 `xxxx****xxxx` 形式打码

---

## 🏗️ 目录结构

```
tyc-agent-cli/
├── api-registry.yaml         # SSOT：167 个工具的注册元数据（构建时输入）
├── package.json              # bin: tyc / entry: dist/index.js
├── tsconfig.json
├── .eslintrc.cjs
├── LICENSE                   # MIT
├── README.md                 # 本文件
├── CHANGELOG.md
│
├── scripts/
│   └── build-registry.ts     # 构建时：YAML → src/generated/t1_1-registry.json
│
└── src/
    ├── index.ts              # CLI 入口（commander 注册）
    ├── types.ts              # Tool / Param / Source / Registry 类型
    ├── client.ts             # tyc OpenAPI HTTP 客户端
    ├── config.ts             # ~/.tyc/config.json 读写
    ├── registry.ts           # 加载 t1_1-registry.json
    ├── aggregator.ts         # 多源并发/串行调度 + condition 求值 + params_template 渲染
    ├── transformer.ts        # 多源合并 + 时间戳格式化 + 元数据注入（_summary/_empty/_warnings）
    ├── utils/
    │   └── jsonToMarkdown.ts # JSON → Markdown 表格化（--md 选项使用）
    ├── commands/
    │   ├── init.ts           # tyc init 命令
    │   └── category.ts       # 动态注册 15 分类 × N 方法子命令
    └── generated/
        └── t1_1-registry.json # 构建产物（gitignored，npm pack 不含）
```

---

## 🔁 与 MCP Server 的关系

`tyc-agent-cli` 配套的 MCP Server（基于 Go 实现的 [apimcp](https://github.com/tianyancha-tech/apimcp)）暴露**完全相同的 167 个工具**到 AI Agent。两者：

| 维度 | tyc-agent-cli | MCP Server (apimcp) |
|-----|--------------|---------------------|
| 协议 | 命令行 / npm 包 | JSON-RPC 2.0 over Streamable HTTP |
| 实现 | TypeScript | Go |
| SSOT | `api-registry.yaml` | 共享同一份 yaml |
| 输出结构 | 完全一致（tyc 英文 key + 时间戳格式化 + 项目元数据） | 同 |
| 用途 | 命令行直查 / 脚本批处理 / Agent 工具调用 | Agent MCP 协议接入 / Web 中间层 |

CLI 不经过 MCP Server，直接以 HTTP 客户端身份调 tyc OpenAPI；TypeScript 端用 `aggregator.ts` + `transformer.ts` 重现了 Go 端的多源合并与元数据注入逻辑，**保证两端输出 1:1 等价**。

---

## 📐 SSOT 同步

本仓库的 `api-registry.yaml` 是 167 工具的 SSOT。`scripts/build-registry.ts` 在 `npm run build` 前自动读取此文件，生成 `src/generated/t1_1-registry.json` 作为 CLI 运行时数据源。

如果你 fork 了上游 [apimcp](https://github.com/tianyancha-tech/apimcp) 大仓库做二次开发，需保持两边 yaml 同步：

```bash
# 从 monorepo 同步（cli/t1_1 子目录视角）
cp ../../docs/t1_1/api-registry.yaml ./api-registry.yaml
npm run build
```

---

## 📋 错误码

| 退出码 | 含义 | 处理建议 |
|-------|------|---------|
| 0 | 成功 | — |
| 1 | 请求失败 | 查 stderr 详情，可能是网络/熔断/参数 |
| 1 | 配置缺失 | 运行 `tyc init --authorization ...` |

下游 tyc OpenAPI 错误码：

| error_code | 含义 | CLI 表现 |
|-----------|------|---------|
| 0 | 成功 | 正常输出 |
| 300000 | 经查无结果 | 自动归一为 `{items: [], total: 0, _empty: true}` + `_summary` 友好文案 |
| 300005 | 无权限（token 不含此接口） | exit 1 + stderr 详情 |
| 其他 | 各类业务/系统错误 | exit 1 + 透传错误信息 |

---

## 🤝 贡献

欢迎 Issue / PR！主要协作流程：

1. Fork 本仓库
2. 编辑 `api-registry.yaml` 新增工具条目（参考已有条目格式）
3. `npm run build` 验证生成的命令树
4. `npm run lint` 通过
5. 提交 PR

---

## 📄 开源协议

本项目采用 [MIT License](LICENSE)。

数据来源：天眼查 OpenAPI（用户需自行获取并合规使用 token）。本工具不存储、不转发、不解析用户的查询数据，所有调用直连天眼查接口。
