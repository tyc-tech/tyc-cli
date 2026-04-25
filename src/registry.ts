import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Registry, Tool, Category } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REGISTRY_PATH = resolve(__dirname, "generated/t1_1-registry.json");

let _registry: Registry | null = null;
let _byName: Map<string, Tool> | null = null;
let _byGroup: Map<string, Tool[]> | null = null;

function load(): Registry {
  if (!_registry) {
    const raw = readFileSync(REGISTRY_PATH, "utf-8");
    _registry = JSON.parse(raw) as Registry;
  }
  return _registry;
}

function byName(): Map<string, Tool> {
  if (!_byName) {
    _byName = new Map();
    for (const t of load().tools) _byName.set(t.name, t);
  }
  return _byName;
}

function byGroup(): Map<string, Tool[]> {
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

export function getTotalCount(): number {
  return load().tools.length;
}
export function getCategories(): Category[] {
  return load().categories;
}
export function getToolsByGroup(group: string): Tool[] {
  return byGroup().get(group) || [];
}
export function getTool(name: string): Tool | undefined {
  return byName().get(name);
}
