# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 规范，版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [Unreleased]

## [0.1.0] - 2026-04-25

### 新增

- 🎉 **首发版本**：天眼查 业务语义层命令行工具
- **15 个分类 / 167 个聚合工具**：覆盖企业基础信息、风险合规、知识产权、经营与公示、历史信息、董监高、股权与关系图谱、集团信息、投资机构、私募基金、建筑资质、企业搜索、财务分析、企业报告、地理与园区
- **多源并发聚合**：每个工具自动并发调用多个 tyc OpenAPI，按声明顺序做顶层 map 覆盖合并；少量场景支持 `serial` 串行执行（前一步结果注入下一步参数）
- **空结果归一化**：tyc `error_code: 300000`（经查无结果）自动归一为 `{items: [], total: 0, _empty: true}` + `_summary` 友好文案
- **时间戳格式化**：毫秒时间戳值自动转为 `Asia/Shanghai` 字符串（`yyyy-MM-dd` / `yyyy-MM-dd HH:mm:ss`），key 名保持 tyc 英文不变
- **命令名自动剥离分类前缀**：`get_company_registration_info` → `tyc company registration-info`
- **三种输出格式**：
  - 默认：紧凑 JSON（适合脚本管道）
  - `--pretty`：缩进 JSON（适合调试）
  - `--md`：Markdown 表格（适合人类阅读 / Agent 上屏）
- **项目元数据注入**：`_summary` / `_empty` / `_warnings` 下划线前缀字段，与 tyc 业务字段区分
- **`tyc init` 命令**：保存 Authorization 到 `~/.tyc/config.json`，与同名 MCP Server 共享配置
- **`tyc list` / `tyc <category> --help`**：动态发现 15 个分类下的全部命令
- **`--verbose`**：打印 HTTP 请求详情到 stderr，便于调试

### 数据源

- 内置 `api-registry.yaml`（167 工具 SSOT）作为构建时数据源，无需联网即可静态生成命令树
