// These headers describe a single transport connection, not the proxied message.
const hopByHopHeaders = [
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "proxy-connection",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]

export const forwardHeaders = (
  source: Headers,
  excluded: Array<string> = [],
): Headers => {
  const headers = new Headers(source)
  const connectionHeaders = source.get("connection")?.split(",") ?? []
  for (const name of [
    ...connectionHeaders,
    ...hopByHopHeaders,
    "content-length",
    ...excluded,
  ]) {
    const trimmed = name.trim()
    if (trimmed !== "") headers.delete(trimmed)
  }
  return headers
}
