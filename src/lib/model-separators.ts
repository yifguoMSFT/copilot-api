export const modelSeparatorIds: ReadonlyArray<string> = [
  "----codex----",
  "----deepseek----",
  "----copilot----",
]

export const isModelSeparator = (id: string): boolean =>
  modelSeparatorIds.includes(id)

/** Input is already grouped; emit one display-only placeholder per group. */
export function addModelSeparators<T>(
  entries: Array<T>,
  provider: (entry: T) => string,
  separator: (entry: T, id: string) => T,
): Array<T> {
  let previous: string | undefined
  return entries.flatMap((entry) => {
    const current = provider(entry)
    if (current === previous) return [entry]
    previous = current
    return [separator(entry, `----${current}----`), entry]
  })
}
