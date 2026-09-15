/**
 * Codex answers a tool call it cannot dispatch with a synthetic `function_call_output` whose text
 * is exactly `unsupported call: <name>`. The model then retries, and both the rejected call and
 * that answer stay in the replayed history; a later strict upstream (Codex/Copilot) rejects the
 * whole request because the name is not a legal tool name.
 *
 * This drops such a pair from the forwarded copy of the history. Only an exact rejection string
 * paired through one unique `call_id` is removed; anything ambiguous is kept.
 */
const REJECTION_PREFIX = "unsupported call: "

const CALL_OUTPUT_TYPES: Record<string, string> = {
  custom_tool_call: "custom_tool_call_output",
  function_call: "function_call_output",
}

const CALL_TYPES = new Set(Object.keys(CALL_OUTPUT_TYPES))
const OUTPUT_TYPES = new Set(Object.values(CALL_OUTPUT_TYPES))

interface CallCandidate {
  ambiguous: boolean
  callId: string
  index: number
  name: string
  outputType: string
  rejections: Set<string>
}

interface OutputCandidate {
  ambiguous: boolean
  index: number
  output: string
  type: string
}

export interface RemovedToolCall {
  callId: string
  name: string
}

export interface RejectedToolCallStrip {
  changed: boolean
  input: Array<unknown>
  removed: Array<RemovedToolCall>
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const nonEmptyString = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined

const rejectionStrings = (
  name: string | undefined,
  namespace: unknown,
): Set<string> => {
  if (name === undefined) return new Set()
  const strings = new Set([`${REJECTION_PREFIX}${name}`])
  const qualified = nonEmptyString(namespace)
  if (qualified !== undefined) {
    strings.add(`${REJECTION_PREFIX}${qualified}::${name}`)
    strings.add(`${REJECTION_PREFIX}${qualified}__${name}`)
  }
  return strings
}

const recordCall = (
  calls: Map<string, CallCandidate>,
  item: Record<string, unknown>,
  index: number,
): void => {
  const callId = nonEmptyString(item.call_id)
  if (callId === undefined) return
  const existing = calls.get(callId)
  if (existing !== undefined) {
    existing.ambiguous = true
    return
  }
  const name = nonEmptyString(item.name)
  calls.set(callId, {
    ambiguous: name === undefined,
    callId,
    index,
    name: name ?? "",
    outputType: CALL_OUTPUT_TYPES[String(item.type)],
    rejections: rejectionStrings(name, item.namespace),
  })
}

const recordOutput = (
  outputs: Map<string, OutputCandidate>,
  item: Record<string, unknown>,
  index: number,
): void => {
  const callId = nonEmptyString(item.call_id)
  const output = nonEmptyString(item.output)
  if (callId === undefined || output === undefined) return
  const existing = outputs.get(callId)
  if (existing !== undefined) {
    existing.ambiguous = true
    return
  }
  outputs.set(callId, {
    ambiguous: false,
    index,
    output,
    type: String(item.type),
  })
}

const isRejectedPair = (
  call: CallCandidate,
  output: OutputCandidate | undefined,
): output is OutputCandidate =>
  !call.ambiguous
  && output !== undefined
  && !output.ambiguous
  && output.type === call.outputType
  && output.index > call.index
  && call.rejections.has(output.output)

export function stripRejectedToolCalls(
  input: Array<unknown>,
): RejectedToolCallStrip {
  const calls = new Map<string, CallCandidate>()
  const outputs = new Map<string, OutputCandidate>()

  for (const [index, item] of input.entries()) {
    if (!isRecord(item)) continue
    const type = typeof item.type === "string" ? item.type : ""
    if (CALL_TYPES.has(type)) recordCall(calls, item, index)
    else if (OUTPUT_TYPES.has(type)) recordOutput(outputs, item, index)
  }

  const dropIndices = new Set<number>()
  const removed: Array<RemovedToolCall> = []
  for (const call of calls.values()) {
    const output = outputs.get(call.callId)
    if (!isRejectedPair(call, output)) continue
    dropIndices.add(call.index)
    dropIndices.add(output.index)
    removed.push({ callId: call.callId, name: call.name })
  }

  if (removed.length === 0) {
    return { changed: false, input, removed }
  }

  return {
    changed: true,
    input: input.filter((_, index) => !dropIndices.has(index)),
    removed,
  }
}
