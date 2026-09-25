export const modelAliases: Readonly<Record<string, string>> = {
  "codex-auto-review": "gpt-6-luna",
}

export const modelAliasEntries = Object.entries(modelAliases)

export const isModelAlias = (model: string): boolean =>
  Object.hasOwn(modelAliases, model)

export const resolveModelAlias = (model: string): string =>
  modelAliases[model] ?? model
