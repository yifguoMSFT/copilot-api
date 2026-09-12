export interface ReasoningContentStrip {
  input: Array<unknown>
  changed: boolean
  indices: Array<number>
  contentParts: number
  encryptedContent: number
}

export function stripReasoningContent(
  input: Array<unknown>,
): ReasoningContentStrip {
  const indices: Array<number> = []
  let contentParts = 0
  let encryptedContent = 0
  const nextInput = input.map((item, index) => {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      return item
    }
    const entry = item as Record<string, unknown>
    if (entry.type !== "reasoning") return item
    if (!Array.isArray(entry.content) || entry.content.length === 0) return item

    indices.push(index)
    contentParts += entry.content.length
    const sanitized: Record<string, unknown> = { ...entry, content: [] }
    if (Object.hasOwn(sanitized, "encrypted_content")) {
      encryptedContent += 1
      delete sanitized.encrypted_content
    }
    return sanitized
  })

  if (indices.length === 0) {
    return {
      input,
      changed: false,
      indices,
      contentParts: 0,
      encryptedContent: 0,
    }
  }
  return {
    input: nextInput,
    changed: true,
    indices,
    contentParts,
    encryptedContent,
  }
}
