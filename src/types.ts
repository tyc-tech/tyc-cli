// 共享类型定义
export interface Param {
  name: string;
  type: string;
  required?: boolean;
  description: string;
}
export interface Source {
  path: string;
  scope: string;
  params_template?: Record<string, string>;
  required?: boolean;
  condition?: string;
}
export interface Summary {
  template: string; // count | count_truncated | empty_generic | empty_risk
  label: string;
}
export interface Tool {
  name: string;
  group: string;
  category_name_zh: string;
  description: string;
  params?: Param[];
  sources: Source[];
  execution?: string; // parallel | serial
  summary?: Summary;
  cliMethod: string;
}
export interface Category {
  group: string;
  name_zh: string;
  tool_count: number;
}
export interface Registry {
  version: string;
  categories: Category[];
  tools: Tool[];
}

export interface TycConfig {
  authorization?: string;
  baseUrl?: string;
}
