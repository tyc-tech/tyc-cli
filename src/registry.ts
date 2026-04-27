// 从 src/catalog.json 加载命令树元数据
//
// catalog.json 由 apimcp 主仓 scripts/gen_cli_catalog 生成；仅包含 CLI
// 需要的字段（name / group / layer / cliMethod / categoryNameZh /
// description / params）。不含 sources / execution / summary 等服务端
// 内部映射，服务端实现细节不泄露。

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  Catalog,
  CatalogCategory,
  CatalogLayerSummary,
  CatalogTool,
  ToolLayer,
} from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CATALOG_PATH = resolve(__dirname, "catalog.json");

let _catalog: Catalog | null = null;
let _byGroup: Map<string, CatalogTool[]> | null = null;
let _byLayer: Map<ToolLayer, CatalogTool[]> | null = null;

function load(): Catalog {
  if (!_catalog) {
    const raw = readFileSync(CATALOG_PATH, "utf-8");
    _catalog = JSON.parse(raw) as Catalog;
  }
  return _catalog;
}

function byGroup(): Map<string, CatalogTool[]> {
  if (!_byGroup) {
    _byGroup = new Map();
    for (const t of load().tools) {
      const arr = _byGroup.get(t.group) || [];
      arr.push(t);
      _byGroup.set(t.group, arr);
    }
  }
  return _byGroup;
}

function byLayer(): Map<ToolLayer, CatalogTool[]> {
  if (!_byLayer) {
    _byLayer = new Map();
    for (const t of load().tools) {
      const arr = _byLayer.get(t.layer) || [];
      arr.push(t);
      _byLayer.set(t.layer, arr);
    }
  }
  return _byLayer;
}

export function getTotalCount(): number {
  return load().tools.length;
}

export function getCategories(): CatalogCategory[] {
  return load().categories;
}

export function getToolsByGroup(group: string): CatalogTool[] {
  return byGroup().get(group) || [];
}

export function getToolsByLayer(layer: ToolLayer): CatalogTool[] {
  return byLayer().get(layer) || [];
}

export function getLayerSummaries(): CatalogLayerSummary[] {
  return load().layers;
}

export function getLayerCount(layer: ToolLayer): number {
  return getLayerSummaries().find((l) => l.layer === layer)?.count ?? 0;
}

export function getCategoryName(group: string): string {
  return getCategories().find((c) => c.group === group)?.name_zh ?? group;
}
