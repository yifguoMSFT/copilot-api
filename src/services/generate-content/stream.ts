import {
  encodeStateCarrier,
  GenerateContentConversionError,
  type JsonObject,
  object,
  responseItemId,
  type ToolIdentity,
} from "./convert"

export const MAX_DATA_BYTES = 1_048_576

let streamSequence = 0

export function nextResponseScope(responseId: string): string {
  if (responseId !== "") return responseId
  streamSequence += 1
  return `gc_resp_${streamSequence.toString(36)}`
}

export interface StreamOptions {
  requestedModel: string
  tools?: ReadonlyMap<string, ToolIdentity>
  createdAt?: number
  itemIdScope?: string
}

interface CandidatePart {
  text?: string
  thoughtSignature?: string
  functionCall?: {
    name: string
    args?: JsonObject
  }
  [key: string]: unknown
}

function optionalObject(value: unknown): JsonObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ?
      (value as JsonObject)
    : undefined
}

export function responsesUsage(value: unknown): JsonObject | null {
  if (value === null || value === undefined) return null
  const source = object(value)
  const count = (key: string): number | undefined => {
    const val = source[key]
    if (typeof val === "number" && Number.isInteger(val) && val >= 0) return val
    return undefined
  }
  const input = count("promptTokenCount")
  const output = count("candidatesTokenCount")
  const thought = count("thoughtsTokenCount")
  const cached = count("cachedContentTokenCount")
  const total = count("totalTokenCount")
  const result: JsonObject = {}
  if (input !== undefined) result.input_tokens = input
  if (output !== undefined && thought !== undefined) {
    result.output_tokens = output + thought
  } else if (output !== undefined) {
    result.output_tokens = output
  }
  if (thought !== undefined) {
    result.output_tokens_details = { reasoning_tokens: thought }
  }
  if (cached !== undefined) {
    result.input_tokens_details = { cached_tokens: cached }
  }
  if (total !== undefined) result.total_tokens = total
  return result
}

export class GenerateContentEventStream {
  private decoder = new TextDecoder("utf-8", { fatal: true })
  private pending = ""
  private output = ""
  private sequence = 0
  private terminal = false
  private cancelled = false
  private started = false
  private retainedBytes = 0
  private retainedUsage: JsonObject | undefined
  private responseId = ""
  private modelVersion = ""
  private finishReason: string | null = null

  // State for streaming items
  private nextOutputIndex = 0
  private messageStarted = false
  private messageOutputIndex = -1
  private messageText = ""
  private messageDone = false

  // Accumulated parts for state carrier (model turn replay)
  private accumulatedParts: Array<JsonObject> = []

  // Output items produced for the final envelope
  private completedItems: Array<JsonObject> = []

  private readonly options: StreamOptions

  constructor(options: StreamOptions) {
    this.options = {
      ...options,
      tools: new Map(options.tools ?? []),
    }
  }

  push(chunk: Uint8Array): string {
    if (this.cancelled) return ""
    try {
      this.pending += this.decoder.decode(chunk, { stream: true })
      this.drain()
    } catch (error) {
      this.fail(error)
    }
    return this.takeOutput()
  }

  flush(): string {
    if (this.cancelled) return ""
    try {
      this.pending += this.decoder.decode()
      this.drain()
      if (!this.terminal) {
        throw new GenerateContentConversionError("Unexpected EOF before terminal frame")
      }
    } catch (error) {
      this.fail(error)
    }
    this.pending = ""
    return this.takeOutput()
  }

  cancel(): void {
    this.cancelled = true
    this.pending = ""
    this.output = ""
    this.decoder = new TextDecoder("utf-8", { fatal: true })
    this.retainedBytes = 0
  }

  private takeOutput(): string {
    const out = this.output
    this.output = ""
    return out
  }

  private drain(): void {
    let boundary = /\r?\n\r?\n/.exec(this.pending)
    while (boundary !== null) {
      const frame = this.pending.slice(0, boundary.index)
      this.pending = this.pending.slice(boundary.index + boundary[0].length)
      if (Buffer.byteLength(frame) > MAX_DATA_BYTES) {
        throw new GenerateContentConversionError("SSE frame exceeds limit")
      }
      this.processFrame(frame)
      boundary = /\r?\n\r?\n/.exec(this.pending)
    }
    if (Buffer.byteLength(this.pending) > MAX_DATA_BYTES) {
      throw new GenerateContentConversionError("SSE frame exceeds limit")
    }
  }

  private processFrame(frame: string): void {
    const lines = frame.split(/\r?\n/)
    const dataLines: Array<string> = []
    for (const line of lines) {
      if (line === "data") {
        dataLines.push("")
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).replace(/^ /, ""))
      }
    }
    if (dataLines.length === 0) return
    const data = dataLines.join("\n")
    if (data === "") return
    if (data === "[DONE]") {
      // Optional end of stream marker in standard SSE
      return
    }
    if (this.terminal) return

    let parsed: JsonObject
    try {
      parsed = object(JSON.parse(data))
    } catch {
      throw new GenerateContentConversionError("Invalid JSON in SSE data frame")
    }

    // Check for error frame
    if (parsed.error !== undefined) {
      this.fail(parsed.error)
      return
    }

    // Cloud Code SSE frames enclose the GenerateContentResponse under "response"
    const candidateResponse = parsed.response !== undefined ? object(parsed.response) : parsed
    this.handleGenerateContentResponse(candidateResponse)
  }

  private handleGenerateContentResponse(resp: JsonObject): void {
    if (resp.responseId !== undefined && typeof resp.responseId === "string") {
      if (this.responseId === "") {
        this.responseId = resp.responseId
      }
    }
    if (resp.modelVersion !== undefined && typeof resp.modelVersion === "string") {
      this.modelVersion = resp.modelVersion
    }
    if (resp.usageMetadata !== undefined) {
      this.retainedUsage = optionalObject(resp.usageMetadata)
    }

    if (!this.started) {
      this.options.itemIdScope ??= nextResponseScope(this.responseId)
      this.started = true
      const initialEnvelope = this.buildEnvelope("in_progress")
      this.emit("response.created", { response: initialEnvelope })
      this.emit("response.in_progress", { response: initialEnvelope })
    }

    const candidates = Array.isArray(resp.candidates) ? resp.candidates : []
    if (candidates.length > 0) {
      const primary = object(candidates[0])
      if (typeof primary.finishReason === "string") {
        this.finishReason = primary.finishReason
      }
      const content = optionalObject(primary.content)
      if (content !== undefined) {
        const parts = Array.isArray(content.parts) ? (content.parts as Array<CandidatePart>) : []
        for (const part of parts) {
          this.processPart(part)
        }
      }
    }

    // If finishReason arrived, finalize the stream
    if (this.finishReason !== null) {
      this.finalize()
    }
  }

  private processPart(part: CandidatePart): void {
    // Retain byte-identical part in accumulatedParts for next-turn state carrier
    this.accumulatedParts.push(structuredClone(part as unknown as JsonObject))

    // 1. Text part (may be empty if carrying signature only)
    if (typeof part.text === "string" && part.text !== "") {
      this.account(part.text)
      if (!this.messageStarted) {
        this.startMessageItem()
      }
      this.messageText += part.text
      this.emit("response.output_text.delta", {
        item_id: responseItemId(this.options.itemIdScope, this.messageOutputIndex),
        output_index: this.messageOutputIndex,
        content_index: 0,
        delta: part.text,
      })
    }

    // 2. Function call part
    if (part.functionCall !== undefined && part.functionCall !== null) {
      const fc = object(part.functionCall)
      const upstreamName = typeof fc.name === "string" ? fc.name : ""
      const argsObj = optionalObject(fc.args) ?? {}
      this.emitToolCall(upstreamName, argsObj)
    }
  }

  private startMessageItem(): void {
    this.messageOutputIndex = this.nextOutputIndex++
    this.messageStarted = true
    const item: JsonObject = {
      id: responseItemId(this.options.itemIdScope, this.messageOutputIndex),
      type: "message",
      status: "in_progress",
      role: "assistant",
      content: [],
    }
    this.emit("response.output_item.added", {
      output_index: this.messageOutputIndex,
      item,
    })
    this.emit("response.content_part.added", {
      item_id: item.id,
      output_index: this.messageOutputIndex,
      content_index: 0,
      part: { type: "output_text", text: "", annotations: [] },
    })
  }

  private finishMessageItem(): void {
    if (!this.messageStarted || this.messageDone) return
    this.messageDone = true
    const itemId = responseItemId(this.options.itemIdScope, this.messageOutputIndex)
    this.emit("response.output_text.done", {
      item_id: itemId,
      output_index: this.messageOutputIndex,
      content_index: 0,
      text: this.messageText,
    })
    this.emit("response.content_part.done", {
      item_id: itemId,
      output_index: this.messageOutputIndex,
      content_index: 0,
      part: { type: "output_text", text: this.messageText, annotations: [] },
    })
    const completedItem: JsonObject = {
      id: itemId,
      type: "message",
      status: "completed",
      role: "assistant",
      content: [{ type: "output_text", text: this.messageText, annotations: [] }],
    }
    this.emit("response.output_item.done", {
      output_index: this.messageOutputIndex,
      item: completedItem,
    })
    this.completedItems.push(completedItem)
  }

  private emitToolCall(upstreamName: string, args: JsonObject): void {
    // If there's an ongoing message, complete it before emitting the tool call item
    if (this.messageStarted && !this.messageDone) {
      this.finishMessageItem()
    }

    const identity = this.options.tools?.get(upstreamName)
    const callId = `call_${responseItemId(this.options.itemIdScope, this.nextOutputIndex)}`
    const outputIndex = this.nextOutputIndex++
    const isCustom = identity?.custom === true

    if (isCustom) {
      const rawInput = typeof args.input === "string" ? args.input : JSON.stringify(args)
      const customItem: JsonObject = {
        id: responseItemId(this.options.itemIdScope, outputIndex),
        type: "custom_tool_call",
        status: "in_progress",
        call_id: callId,
        name: identity.name,
        input: "",
      }
      if (identity.namespace !== undefined) {
        customItem.namespace = identity.namespace
      }
      this.emit("response.output_item.added", {
        output_index: outputIndex,
        item: customItem,
      })
      this.emit("response.custom_tool_call_input.delta", {
        item_id: customItem.id,
        output_index: outputIndex,
        delta: rawInput,
      })
      this.emit("response.custom_tool_call_input.done", {
        item_id: customItem.id,
        output_index: outputIndex,
        input: rawInput,
      })
      const finished: JsonObject = {
        ...customItem,
        status: "completed",
        input: rawInput,
      }
      this.emit("response.output_item.done", {
        output_index: outputIndex,
        item: finished,
      })
      this.completedItems.push(finished)
    } else {
      const rawArgs = JSON.stringify(args)
      const funcItem: JsonObject = {
        id: responseItemId(this.options.itemIdScope, outputIndex),
        type: "function_call",
        status: "in_progress",
        call_id: callId,
        name: identity?.name ?? upstreamName,
        arguments: "",
      }
      if (identity?.namespace !== undefined) {
        funcItem.namespace = identity.namespace
      }
      this.emit("response.output_item.added", {
        output_index: outputIndex,
        item: funcItem,
      })
      this.emit("response.function_call_arguments.delta", {
        item_id: funcItem.id,
        output_index: outputIndex,
        delta: rawArgs,
      })
      this.emit("response.function_call_arguments.done", {
        item_id: funcItem.id,
        output_index: outputIndex,
        arguments: rawArgs,
      })
      const finished: JsonObject = {
        ...funcItem,
        status: "completed",
        arguments: rawArgs,
      }
      this.emit("response.output_item.done", {
        output_index: outputIndex,
        item: finished,
      })
      this.completedItems.push(finished)
    }
  }

  private finalize(): void {
    if (this.terminal) return
    if (this.messageStarted && !this.messageDone) {
      this.finishMessageItem()
    }

    // Check if any parts carry thoughtSignature or if any model parts were accumulated
    // If thoughtSignature exists in any accumulated part, emit a reasoning item to carry state
    const hasThoughtOrSignature = this.accumulatedParts.some(
      (p) => typeof p.thoughtSignature === "string" && p.thoughtSignature !== "",
    )
    if (hasThoughtOrSignature && this.accumulatedParts.length > 0) {
      const reasoningItem: JsonObject = {
        id: responseItemId(this.options.itemIdScope, this.nextOutputIndex++),
        type: "reasoning",
        summary: [],
        encrypted_content: encodeStateCarrier(this.accumulatedParts),
      }
      // Emit the output item lifecycle for streaming clients like Codex
      this.emit("response.output_item.added", {
        output_index: this.completedItems.length,
        item: reasoningItem,
      })
      this.emit("response.output_item.done", {
        output_index: this.completedItems.length,
        item: reasoningItem,
      })
      // Unshift reasoning item so it appears before message output, matching Responses convention
      this.completedItems.unshift(reasoningItem)
    }

    const isComplete = this.finishReason === "STOP"
    const isLength = this.finishReason === "MAX_TOKENS"
    const status = isComplete ? "completed" : isLength ? "incomplete" : "failed"

    const finalEnvelope = this.buildEnvelope(status)
    if (status === "completed") {
      this.emit("response.completed", { response: finalEnvelope })
    } else if (status === "incomplete") {
      this.emit("response.incomplete", { response: finalEnvelope })
    } else {
      this.emit("response.failed", { response: finalEnvelope })
    }

    this.terminal = true
    this.pending = ""
    this.retainedBytes = 0
  }

  private buildEnvelope(status: string): JsonObject {
    const resp: JsonObject = {
      id: this.responseId,
      object: "response",
      model: this.options.requestedModel,
      created_at: this.options.createdAt ?? Math.floor(Date.now() / 1000),
      status,
      output: this.completedItems.map((item) => structuredClone(item)),
    }
    if (status !== "in_progress") {
      resp.usage = responsesUsage(this.retainedUsage)
    }
    return resp
  }

  private account(text: string): void {
    this.retainedBytes += Buffer.byteLength(text)
    if (this.retainedBytes > MAX_DATA_BYTES * 8) {
      throw new GenerateContentConversionError("Stream buffer exceeds limit")
    }
  }

  private fail(error: unknown): void {
    if (this.terminal) return
    const details =
      error instanceof Error ?
        { code: "conversion_error", message: error.message }
      : object(error)

    if (this.messageStarted && !this.messageDone) {
      this.finishMessageItem()
    }

    this.emit("response.failed", {
      response: {
        id: this.responseId,
        object: "response",
        model: this.options.requestedModel,
        created_at: this.options.createdAt ?? Math.floor(Date.now() / 1000),
        status: "failed",
        output: this.completedItems.map((item) => structuredClone(item)),
        error: {
          code: details.code ?? "upstream_error",
          message: details.message ?? "GenerateContent stream failed",
        },
        usage: responsesUsage(this.retainedUsage),
      },
    })
    this.terminal = true
    this.pending = ""
    this.retainedBytes = 0
  }

  private emit(type: string, payload: JsonObject): void {
    this.output += `event: ${type}\ndata: ${JSON.stringify({ type, sequence_number: this.sequence++, ...payload })}\n\n`
  }
}

export function createGenerateContentEventStream(
  options: StreamOptions,
): GenerateContentEventStream {
  return new GenerateContentEventStream(options)
}
