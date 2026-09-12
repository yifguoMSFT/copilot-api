import { isDeepStrictEqual } from "node:util"

import {
  type ConversionOptions,
  convertInteractionStep,
  convertInteractionsResponseToResponses,
  InteractionsConversionError,
  type JsonObject,
  MAX_DATA_BYTES,
  object,
  parseArguments,
  string,
} from "./convert"

interface StepState {
  index: number
  outputIndex: number
  step: JsonObject
  args: string
  parts: Array<string>
  stopped: boolean
  done: boolean
  item?: JsonObject
}

function optionalObject(value: unknown): JsonObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ?
      (value as JsonObject)
    : undefined
}

/** One instance per response. Owns bytes and protocol state, never network I/O. */
export class InteractionsEventStream {
  private decoder = new TextDecoder(undefined, { fatal: true })
  private pending = ""
  private output = ""
  private sequence = 0
  private terminal = false
  private cancelled = false
  private sentDone = false
  private started = false
  private retainedBytes = 0
  private retainedUsage: JsonObject | undefined
  private interaction: JsonObject
  private steps = new Map<number, StepState>()
  private nextOutputIndex = 0

  private readonly options: ConversionOptions & { requestedModel: string }

  constructor(options: ConversionOptions & { requestedModel: string }) {
    this.options = { ...options, customTools: new Set(options.customTools) }
    this.interaction = {
      id: "",
      model: options.requestedModel,
      status: "in_progress",
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
      if (!this.terminal)
        throw new InteractionsConversionError("Unexpected EOF")
    } catch (error) {
      this.fail(error)
    }
    this.pending = ""
    this.steps.clear()
    return this.takeOutput()
  }

  cancel(): void {
    this.cancelled = true
    this.pending = ""
    this.output = ""
    this.steps.clear()
    this.decoder = new TextDecoder(undefined, { fatal: true })
    this.retainedBytes = 0
  }

  private takeOutput(): string {
    const output = this.output
    this.output = ""
    return output
  }

  private drain(): void {
    let boundary = /\r?\n\r?\n/.exec(this.pending)
    while (boundary !== null) {
      const frame = this.pending.slice(0, boundary.index)
      this.pending = this.pending.slice(boundary.index + boundary[0].length)
      if (Buffer.byteLength(frame) > MAX_DATA_BYTES)
        throw new InteractionsConversionError("SSE frame exceeds limit")
      this.frame(frame)
      boundary = /\r?\n\r?\n/.exec(this.pending)
    }
    if (Buffer.byteLength(this.pending) > MAX_DATA_BYTES)
      throw new InteractionsConversionError("SSE frame exceeds limit")
  }

  private frame(frame: string): void {
    const data = frame
      .split(/\r?\n/)
      .filter((line) => line === "data" || line.startsWith("data:"))
      .map((line) => line.slice(5).replace(/^ /, ""))
      .join("\n")
    if (data === "") return
    if (data === "[DONE]") {
      if (!this.terminal)
        throw new InteractionsConversionError(
          "DONE before interaction terminal",
        )
      if (!this.sentDone) this.output += "data: [DONE]\n\n"
      this.sentDone = true
      return
    }
    if (this.terminal) return
    this.event(object(JSON.parse(data)))
  }

  private event(event: JsonObject): void {
    if (event.event_type === "error") {
      this.fail(object(event.error))
      return
    }
    if (event.event_type === "interaction.created") {
      if (this.started)
        throw new InteractionsConversionError("Duplicate interaction.created")
      this.interaction = {
        ...this.interaction,
        ...object(event.interaction),
        status: "in_progress",
      }
      string(this.interaction.id)
      this.started = true
      const response = this.envelope("in_progress")
      this.emit("response.created", { response })
      this.emit("response.in_progress", { response })
      return
    }
    if (!this.started)
      throw new InteractionsConversionError("Missing interaction.created")
    switch (event.event_type) {
      case "interaction.status_update": {
        return
      }
      case "step.start": {
        this.start(event)
        return
      }
      case "step.delta": {
        this.delta(event)
        return
      }
      case "step.stop": {
        const state = this.state(event.index)
        if (state.stopped)
          throw new InteractionsConversionError("Duplicate step.stop")
        state.stopped = true
        this.captureUsage(event.usage)
        if (state.step.type !== "thought") this.finishStep(state)
        return
      }
      case "interaction.completed": {
        this.complete(object(event.interaction))
        return
      }
      default: {
        throw new InteractionsConversionError(
          `Unsupported event: ${String(event.event_type)}`,
        )
      }
    }
  }

  private start(event: JsonObject): void {
    const index = event.index
    if (
      typeof index !== "number"
      || !Number.isInteger(index)
      || index < 0
      || this.steps.has(index)
    ) {
      throw new InteractionsConversionError("Invalid or duplicate step index")
    }
    if ([...this.steps.keys()].some((previous) => previous > index)) {
      throw new InteractionsConversionError("Out-of-order step start")
    }
    const step = structuredClone(object(event.step))
    if (
      !["function_call", "model_output", "thought"].includes(String(step.type))
    ) {
      throw new InteractionsConversionError("Unsupported stream step")
    }
    const initial =
      step.type === "function_call" ?
        undefined
      : convertInteractionStep(step, index, this.options)
    this.account(JSON.stringify(step))
    const state: StepState = {
      index,
      outputIndex: this.nextOutputIndex++,
      step,
      // Streaming arguments arrive as `arguments_delta` text. The object on
      // `step.start` is a required-field placeholder (`{}`) in that mode, so
      // the text buffer starts empty and only falls back to the object when
      // no delta is sent. Verified against live v1 traffic: a 300-character
      // call still arrives as a single delta holding the whole JSON text.
      args: "",
      parts: [],
      stopped: false,
      done: false,
    }
    this.steps.set(index, state)
    if (step.type === "function_call") return
    const item = initial
    if (item === undefined)
      throw new InteractionsConversionError("Missing output item")
    this.emit("response.output_item.added", {
      output_index: state.outputIndex,
      item: {
        ...item,
        ...(step.type === "model_output" ?
          { content: [], status: "in_progress" }
        : { summary: [], encrypted_content: undefined }),
      },
    })
    const contents = step.type === "thought" ? step.summary : step.content
    if (Array.isArray(contents)) {
      for (const part of contents)
        this.addPart(state, string(object(part).text))
    }
  }

  private state(index: unknown): StepState {
    const state = typeof index === "number" ? this.steps.get(index) : undefined
    if (state === undefined)
      throw new InteractionsConversionError("Delta/stop without step.start")
    return state
  }

  private delta(event: JsonObject): void {
    const state = this.state(event.index)
    const delta = object(event.delta)
    this.captureUsage(optionalObject(event.metadata)?.total_usage)
    if (state.done || (state.stopped && delta.type !== "thought_signature")) {
      throw new InteractionsConversionError("Delta after step.stop")
    }
    switch (delta.type) {
      case "text": {
        if (state.step.type !== "model_output")
          throw new InteractionsConversionError("Text on non-message step")
        const text = string(delta.text)
        this.account(text)
        if (state.parts.length === 0) this.addPart(state, "")
        const contentIndex = state.parts.length - 1
        state.parts[contentIndex] += text
        this.emit("response.output_text.delta", {
          ...this.coordinates(state),
          content_index: contentIndex,
          delta: text,
        })
        return
      }
      case "arguments_delta": {
        if (state.step.type !== "function_call")
          throw new InteractionsConversionError("Arguments on non-tool step")
        const text = string(delta.arguments)
        this.account(text)
        state.args += text
        if (Buffer.byteLength(state.args) > MAX_DATA_BYTES)
          throw new InteractionsConversionError("Arguments exceed limit")
        return
      }
      case "thought_summary": {
        if (state.step.type !== "thought")
          throw new InteractionsConversionError("Summary on non-thought step")
        const content = object(delta.content)
        if (content.type !== "text")
          throw new InteractionsConversionError("Unsupported thought summary")
        const text = string(content.text)
        this.account(text)
        this.addPart(state, text)
        return
      }
      case "thought_signature": {
        if (state.step.type !== "thought")
          throw new InteractionsConversionError("Signature on non-thought step")
        this.account(string(delta.signature))
        state.step.signature = delta.signature
        return
      }
      default: {
        throw new InteractionsConversionError("Unsupported delta")
      }
    }
  }

  private coordinates(state: StepState): JsonObject {
    return { item_id: `step_${state.index}`, output_index: state.outputIndex }
  }

  private addPart(state: StepState, text: string): void {
    const index = state.parts.length
    state.parts.push(text)
    const thought = state.step.type === "thought"
    const key = thought ? "summary_index" : "content_index"
    const prefix =
      thought ? "response.reasoning_summary_part" : "response.content_part"
    const part =
      thought ?
        { type: "summary_text", text: "" }
      : { type: "output_text", text: "", annotations: [] }
    this.emit(`${prefix}.added`, {
      ...this.coordinates(state),
      [key]: index,
      part,
    })
    if (text !== "")
      this.emit(
        thought ?
          "response.reasoning_summary_text.delta"
        : "response.output_text.delta",
        {
          ...this.coordinates(state),
          [key]: index,
          delta: text,
        },
      )
  }

  private finishStep(state: StepState, incomplete = false): void {
    if (state.done) return
    const step = this.materialize(state)
    const item = convertInteractionStep(step, state.index, this.options)
    if (item === undefined)
      throw new InteractionsConversionError("Missing item")
    if (incomplete && item.type === "message") item.status = "incomplete"
    if (step.type === "function_call") this.finishTool(state, item)
    else this.finishParts(state)
    this.emit("response.output_item.done", {
      output_index: state.outputIndex,
      item,
    })
    state.done = true
    state.item = item
  }

  private materialize(state: StepState): JsonObject {
    const step = { ...state.step }
    if (step.type === "function_call")
      step.arguments =
        state.args === "" ?
          object(state.step.arguments ?? {})
        : parseArguments(state.args)
    else
      step[step.type === "thought" ? "summary" : "content"] = state.parts.map(
        (text) => ({ type: "text", text }),
      )
    return step
  }

  private finishTool(state: StepState, item: JsonObject): void {
    const custom = item.type === "custom_tool_call"
    const field = custom ? "input" : "arguments"
    const event =
      custom ?
        "response.custom_tool_call_input"
      : "response.function_call_arguments"
    this.emit("response.output_item.added", {
      output_index: state.outputIndex,
      item: { ...item, [field]: "", status: "in_progress" },
    })
    this.emit(`${event}.delta`, {
      ...this.coordinates(state),
      delta: item[field],
    })
    this.emit(`${event}.done`, {
      ...this.coordinates(state),
      [field]: item[field],
    })
  }

  private finishParts(state: StepState): void {
    const thought = state.step.type === "thought"
    for (const [index, text] of state.parts.entries()) {
      const coordinates = {
        ...this.coordinates(state),
        [thought ? "summary_index" : "content_index"]: index,
      }
      this.emit(
        thought ?
          "response.reasoning_summary_text.done"
        : "response.output_text.done",
        { ...coordinates, text },
      )
      this.emit(
        thought ?
          "response.reasoning_summary_part.done"
        : "response.content_part.done",
        {
          ...coordinates,
          part:
            thought ?
              { type: "summary_text", text }
            : { type: "output_text", text, annotations: [] },
        },
      )
    }
  }

  private complete(snapshot: JsonObject): void {
    if (snapshot.id !== undefined && snapshot.id !== this.interaction.id)
      throw new InteractionsConversionError("Interaction id changed")
    if (snapshot.steps !== undefined) this.verifySnapshot(snapshot.steps)
    this.interaction = { ...this.interaction, ...snapshot }
    if (snapshot.usage === undefined && this.retainedUsage !== undefined)
      this.interaction.usage = this.retainedUsage
    if (
      ![
        "cancelled",
        "completed",
        "failed",
        "incomplete",
        "requires_action",
      ].includes(String(this.interaction.status))
    ) {
      throw new InteractionsConversionError("Nonterminal completed event")
    }
    const incomplete = !["completed", "requires_action"].includes(
      String(this.interaction.status),
    )
    for (const state of this.steps.values()) this.finishStep(state, incomplete)
    const response = this.envelope(string(this.interaction.status))
    this.emit(`response.${String(response.status)}`, { response })
    this.terminal = true
    this.steps.clear()
    this.retainedBytes = 0
  }

  private verifySnapshot(value: unknown): void {
    if (!Array.isArray(value))
      throw new InteractionsConversionError("Invalid terminal steps")
    if (this.steps.size === 0) {
      for (const [index, step] of value.entries()) this.start({ index, step })
      return
    }
    if (value.length !== this.steps.size)
      throw new InteractionsConversionError("Terminal steps mismatch")
    for (const [index, step] of value.entries()) {
      const state = this.state(index)
      if (!isDeepStrictEqual(this.materialize(state), step))
        throw new InteractionsConversionError(
          "Terminal content differs from stream",
        )
    }
  }

  private envelope(status: string): JsonObject {
    const response = convertInteractionsResponseToResponses(
      { ...this.interaction, status, steps: [] },
      this.options,
    )
    response.output = [...this.steps.values()].flatMap((state) =>
      state.item === undefined ? [] : [state.item],
    )
    return response
  }

  private account(text: string): void {
    this.retainedBytes += Buffer.byteLength(text)
    if (this.retainedBytes > MAX_DATA_BYTES * 8)
      throw new InteractionsConversionError("Stream buffer exceeds limit")
  }

  /** Keeps the latest cumulative usage snapshot; never sums partial values. */
  private captureUsage(value: unknown): void {
    const usage = optionalObject(value)
    if (usage !== undefined) this.retainedUsage = usage
  }

  private finishPartial(state: StepState): void {
    const thought = state.step.type === "thought"
    const item: JsonObject =
      thought ?
        {
          type: "reasoning",
          id: `step_${state.index}`,
          summary: state.parts.map((text) => ({ type: "summary_text", text })),
        }
      : {
          type: "message",
          id: `step_${state.index}`,
          role: "assistant",
          status: "incomplete",
          content: state.parts.map((text) => ({
            type: "output_text",
            text,
            annotations: [],
          })),
        }
    this.finishParts(state)
    this.emit("response.output_item.done", {
      output_index: state.outputIndex,
      item,
    })
    state.item = item
    state.done = true
  }

  private fail(error: unknown): void {
    if (this.terminal) return
    const details =
      error instanceof Error ?
        { code: "conversion_error", message: error.message }
      : object(error)
    for (const state of this.steps.values()) {
      if (!state.done && state.step.type !== "function_call")
        this.finishPartial(state)
    }
    const partial = [...this.steps.values()].flatMap((state) =>
      state.item === undefined ? [] : [state.item],
    )
    this.emit("response.failed", {
      response: {
        id: this.interaction.id,
        object: "response",
        model: this.options.requestedModel,
        created_at: this.options.createdAt ?? 0,
        status: "failed",
        output: partial,
        error: {
          code: details.code ?? "upstream_error",
          message: details.message ?? "Interaction failed",
        },
        usage: null,
      },
    })
    this.terminal = true
    this.steps.clear()
    this.pending = ""
    this.retainedBytes = 0
  }

  private emit(type: string, payload: JsonObject): void {
    this.output += `event: ${type}\ndata: ${JSON.stringify({ type, sequence_number: this.sequence++, ...payload })}\n\n`
  }
}

export function createInteractionsEventStream(
  options: ConversionOptions & { requestedModel: string },
): InteractionsEventStream {
  return new InteractionsEventStream({
    ...options,
    customTools: new Set(options.customTools),
  })
}
