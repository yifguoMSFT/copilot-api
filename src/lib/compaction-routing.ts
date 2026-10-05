const metadataName = "x-codex-turn-metadata"

export function compactionMetadataSource(
  headers: Headers,
  payload: Record<string, unknown>,
): "header" | "body" | undefined {
  const header = headers.get(metadataName)
  const clientMetadata = payload.client_metadata
  const bodyMetadata =
    (
      clientMetadata !== null
      && typeof clientMetadata === "object"
      && !Array.isArray(clientMetadata)
    ) ?
      (clientMetadata as Record<string, unknown>)[metadataName]
    : undefined
  const metadata = header ?? bodyMetadata
  if (typeof metadata !== "string") return undefined

  try {
    const parsed: unknown = JSON.parse(metadata)
    if (
      parsed !== null
      && typeof parsed === "object"
      && !Array.isArray(parsed)
      && (parsed as Record<string, unknown>).request_kind === "compaction"
    ) {
      return header === null ? "body" : "header"
    }
  } catch {
    // Optional detection metadata must not reject an otherwise valid request.
  }
  return undefined
}
