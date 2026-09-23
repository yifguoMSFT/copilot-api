const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

interface NormalizedList {
  count: number
  tools: Array<unknown>
}

interface NormalizedTool {
  count: number
  tool: Record<string, unknown>
}

/**
 * Function parameters are always an object, but Codex can express that object
 * as a `oneOf`/`$defs` union without declaring a root `type`. Some upstreams
 * reject the implied form, so the constraint is declared explicitly here. Only
 * the missing root type is added; union branches, references, and nested
 * schemas are forwarded untouched.
 */
function normalizeTool(tool: unknown): NormalizedTool | undefined {
  if (!isRecord(tool)) return undefined

  if (tool.type === "namespace") {
    const nested = normalizeToolList(tool.tools)
    if (nested === undefined) return undefined
    return { count: nested.count, tool: { ...tool, tools: nested.tools } }
  }

  if (tool.type !== "function") return undefined

  const parameters = tool.parameters
  if (!isRecord(parameters) || Object.hasOwn(parameters, "type"))
    return undefined

  return {
    count: 1,
    tool: { ...tool, parameters: { ...parameters, type: "object" } },
  }
}

/**
 * Returns the rewritten list, or undefined when every entry already declares
 * its root type. Callers keep the original value in that case.
 */
function normalizeToolList(tools: unknown): NormalizedList | undefined {
  if (!Array.isArray(tools)) return undefined

  let count = 0
  let changed = false
  const next: Array<unknown> = []

  for (const entry of tools) {
    const normalized = normalizeTool(entry)
    if (normalized === undefined) {
      next.push(entry)
      continue
    }
    changed = true
    count += normalized.count
    next.push(normalized.tool)
  }

  return changed ? { count, tools: next } : undefined
}

/**
 * Tool declarations are only read from the places the Responses protocol
 * defines: `additional_tools` and `tool_search_output` items that carry tools
 * discovered mid-conversation.
 */
function normalizeInputItems(
  items: Array<unknown>,
): NormalizedList | undefined {
  let count = 0
  let changed = false
  const next: Array<unknown> = []

  for (const item of items) {
    if (!isRecord(item)) {
      next.push(item)
      continue
    }
    if (
      item.type !== "additional_tools"
      && item.type !== "tool_search_output"
    ) {
      next.push(item)
      continue
    }
    const normalized = normalizeToolList(item.tools)
    if (normalized === undefined) {
      next.push(item)
      continue
    }
    changed = true
    count += normalized.count
    next.push({ ...item, tools: normalized.tools })
  }

  return changed ? { count, tools: next } : undefined
}

export interface NormalizeFunctionSchemaRootsResult {
  changed: boolean
  normalizedCount: number
  payload: Record<string, unknown>
}

/**
 * Declares the object root of function parameter schemas that rely on their
 * union branches to imply it, for both top-level tools and tools discovered
 * mid-conversation. Nothing is renamed, dropped, or reordered.
 */
export function normalizeFunctionSchemaRoots(
  payload: Record<string, unknown>,
): NormalizeFunctionSchemaRootsResult {
  let next = payload
  let normalizedCount = 0

  const topLevel = normalizeToolList(payload.tools)
  if (topLevel !== undefined) {
    next = { ...next, tools: topLevel.tools }
    normalizedCount += topLevel.count
  }

  if (Array.isArray(payload.input)) {
    const input = normalizeInputItems(payload.input)
    if (input !== undefined) {
      next = { ...next, input: input.tools }
      normalizedCount += input.count
    }
  }

  return { changed: next !== payload, normalizedCount, payload: next }
}
