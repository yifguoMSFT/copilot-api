import { createHash } from "node:crypto"

const EXPECTED_PREFIXES = {
  custom_tool_call: "ctc",
  custom_tool_call_output: "ctco",
  function_call: "fc",
  message: "msg",
  reasoning: "rs",
} as const

type SupportedType = keyof typeof EXPECTED_PREFIXES

export interface SanitizeInputIdsResult {
  changed: boolean
  input: Array<unknown>
  renamedCount: number
}

function computeCollisionId(id: string, attempt: number): string {
  const hash = createHash("sha256")
    .update(`${id}:${attempt}`)
    .digest("hex")
    .slice(0, 8)
  return `${id}_${hash}`
}

function findNonCollidingId(
  targetId: string,
  occupiedIds: Set<string>,
): string {
  let attempt = 0
  while (attempt < 1000) {
    const candidate = computeCollisionId(targetId, attempt)
    attempt += 1
    if (!occupiedIds.has(candidate)) {
      occupiedIds.add(candidate)
      return candidate
    }
  }
  return `${targetId}_fallback`
}

function collectExistingIds(input: Array<unknown>): Set<string> {
  const ids = new Set<string>()
  for (const item of input) {
    if (item === null || typeof item !== "object" || Array.isArray(item))
      continue
    const id = (item as Record<string, unknown>).id
    if (typeof id === "string" && id !== "") ids.add(id)
  }
  return ids
}

export function sanitizeInputItemIds(input: unknown): SanitizeInputIdsResult {
  if (!Array.isArray(input)) {
    return { changed: false, input: input as Array<unknown>, renamedCount: 0 }
  }

  const preservedIds = collectExistingIds(input)
  const occupiedIds = new Set(preservedIds)
  const renameMap = new Map<string, string>()
  const collisionMap = new Map<string, string>()

  for (const item of input) {
    if (item === null || typeof item !== "object" || Array.isArray(item))
      continue
    const record = item as Record<string, unknown>
    if (
      typeof record.type !== "string"
      || !Object.hasOwn(EXPECTED_PREFIXES, record.type)
    ) {
      continue
    }
    const expectedPrefix = EXPECTED_PREFIXES[record.type as SupportedType]
    const id = record.id

    if (typeof id !== "string" || id === "") {
      continue
    }
    if (id.startsWith(expectedPrefix)) {
      continue
    }

    let targetId = `${expectedPrefix}_${id}`
    if (preservedIds.has(targetId)) {
      let resolved = collisionMap.get(targetId)
      if (!resolved) {
        resolved = findNonCollidingId(targetId, occupiedIds)
        collisionMap.set(targetId, resolved)
      }
      targetId = resolved
    } else {
      occupiedIds.add(targetId)
    }

    renameMap.set(id, targetId)
  }

  if (renameMap.size === 0) {
    return { changed: false, input, renamedCount: 0 }
  }

  const nextInput: Array<unknown> = input.map((item): unknown => {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      return item
    }
    const record = item as Record<string, unknown>
    const id = record.id
    if (typeof id === "string" && renameMap.has(id)) {
      return { ...record, id: renameMap.get(id) }
    }
    if (
      record.type === "item_reference"
      && typeof record.id === "string"
      && renameMap.has(record.id)
    ) {
      return { ...record, id: renameMap.get(record.id) }
    }
    return record
  })

  return { changed: true, input: nextInput, renamedCount: renameMap.size }
}
