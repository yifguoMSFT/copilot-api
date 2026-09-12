export interface ReasoningContentStrip {
  input: Array<unknown>
  changed: boolean
  indices: Array<number>
  contentParts: number
}

export function stripReasoningContent(
  input: Array<unknown>,
): ReasoningContentStrip {
  const indices: Array<number> = []
  let contentParts = 0
  const nextInput = input.map((item, index) => {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      return item
    }
    const entry = item as Record<string, unknown>
    if (entry.type !== "reasoning") return item
    if (!Array.isArray(entry.content) || entry.content.length === 0) return item

    indices.push(index)
    contentParts += entry.content.length
    return { ...entry, content: [] }
  })

  if (indices.length === 0) {
    return { input, changed: false, indices, contentParts: 0 }
  }
  return { input: nextInput, changed: true, indices, contentParts }
}
