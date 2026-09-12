import { z } from "zod"

export type JsonObject = Record<string, unknown>

export class InteractionsConversionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "InteractionsConversionError"
  }
}

export const MAX_DATA_BYTES = 1_048_576
const textContent = z.strictObject({
  type: z.literal("text"),
  text: z.string(),
})
const thoughtSchema = z.strictObject({
  type: z.literal("thought"),
  signature: z.string().optional(),
  summary: z.array(textContent).optional(),
})
const requestSchema = z.strictObject({
  model: z.string().min(1),
  input: z.union([z.string(), z.array(z.record(z.string(), z.unknown()))]),
  instructions: z.string().optional(),
  stream: z.boolean().optional(),
  store: z.boolean().optional(),
  previous_response_id: z.string().min(1).nullable().optional(),
  max_output_tokens: z.number().int().positive().optional(),
  tools: z.array(z.record(z.string(), z.unknown())).optional(),
  tool_choice: z.unknown().optional(),
  reasoning: z
    .strictObject({
      effort: z.enum(["minimal", "low", "medium", "high"]).optional(),
      summary: z.literal("auto").optional(),
    })
    .optional(),
  text: z
    .strictObject({
      format: z.strictObject({ type: z.literal("text") }).optional(),
    })
    .optional(),
  include: z.array(z.literal("reasoning.encrypted_content")).optional(),
  prompt_cache_key: z.string().optional(),
})

export interface ConversionOptions {
  upstreamModel?: string
  requestedModel?: string
  customTools?: ReadonlySet<string>
  metadata?: Readonly<Record<string, string>>
  createdAt?: number
}

export function object(value: unknown): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new InteractionsConversionError("Expected an object")
  }
  return value as JsonObject
}

export function string(value: unknown): string {
  if (typeof value !== "string") {
    throw new InteractionsConversionError("Expected a string")
  }
  return value
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) {
    throw new InteractionsConversionError(result.error.message)
  }
  return result.data
}

export function parseArguments(value: string): JsonObject {
  if (Buffer.byteLength(value) > MAX_DATA_BYTES) {
    throw new InteractionsConversionError("Arguments exceed buffer limit")
  }
  try {
    return object(JSON.parse(value))
  } catch {
    throw new InteractionsConversionError(
      "Tool arguments must be a JSON object",
    )
  }
}

function fields(item: JsonObject, allowed: string): void {
  for (const key of Object.keys(item)) {
    if (!allowed.split(" ").includes(key)) {
      throw new InteractionsConversionError(`Unsupported field: ${key}`)
    }
  }
}

function messageText(content: unknown): string {
  if (typeof content === "string") return content
  return parse(
    z.array(
      z
        .object({
          type: z.enum(["input_text", "output_text"]),
          text: z.string(),
          annotations: z.array(z.unknown()).max(0).optional(),
        })
        .strict(),
    ),
    content,
  )
    .map((part) => part.text)
    .join("")
}

function toolDefinition(tool: JsonObject): JsonObject {
  fields(tool, "type name description parameters strict format")
  const name = parse(z.string().min(1), tool.name)
  if (
    tool.strict !== undefined
    && tool.strict !== null
    && tool.strict !== false
  ) {
    throw new InteractionsConversionError("strict tools are not supported")
  }
  const result: JsonObject = { type: "function", name }
  if (tool.description !== undefined)
    result.description = string(tool.description)
  if (tool.type === "custom") {
    if (tool.format !== undefined) {
      parse(z.strictObject({ type: z.literal("text") }), tool.format)
    }
    if (tool.parameters !== undefined) {
      throw new InteractionsConversionError(
        "custom tool cannot specify parameters",
      )
    }
    result.parameters = {
      type: "object",
      properties: { input: { type: "string" } },
      required: ["input"],
      additionalProperties: false,
    }
  } else if (tool.type === "function") {
    if (tool.format !== undefined)
      throw new InteractionsConversionError("Unsupported function format")
    result.parameters = structuredClone(object(tool.parameters))
  } else {
    throw new InteractionsConversionError(
      `Unsupported tool: ${String(tool.type)}`,
    )
  }
  return result
}

function toolChoice(value: unknown, names: Set<string>): unknown {
  if (value === undefined) return undefined
  if (
    typeof value === "string"
    && ["auto", "none", "required"].includes(value)
  ) {
    return value === "required" ? "any" : value
  }
  const choice = parse(
    z.strictObject({
      type: z.enum(["function", "custom"]),
      name: z.string(),
    }),
    value,
  )
  if (!names.has(choice.name))
    throw new InteractionsConversionError("Unknown chosen tool")
  return { allowed_tools: { mode: "any", tools: [choice.name] } }
}

function decodeThought(value: unknown): JsonObject {
  const encoded = string(value)
  if (!encoded.startsWith("agdata1.") || encoded.length > MAX_DATA_BYTES * 2) {
    throw new InteractionsConversionError(
      "Unsupported reasoning replay envelope",
    )
  }
  const payload = encoded.slice(8)
  if (!/^[\w-]+$/.test(payload))
    throw new InteractionsConversionError("Invalid replay encoding")
  const bytes = Buffer.from(payload, "base64url")
  if (
    bytes.length > MAX_DATA_BYTES
    || bytes.toString("base64url") !== payload
  ) {
    throw new InteractionsConversionError("Invalid replay size or encoding")
  }
  try {
    return parse(thoughtSchema, JSON.parse(bytes.toString("utf8")))
  } catch {
    throw new InteractionsConversionError("Invalid thought replay data")
  }
}

function historyItem(item: JsonObject, calls: Map<string, string>): JsonObject {
  switch (item.type) {
    case undefined:
    case "message": {
      fields(item, "type id role content status")
      const role = parse(z.enum(["user", "assistant"]), item.role)
      return {
        type: role === "user" ? "user_input" : "model_output",
        content: [{ type: "text", text: messageText(item.content) }],
      }
    }
    case "function_call":
    case "custom_tool_call": {
      fields(item, "type id call_id name arguments input status")
      const id = parse(z.string().min(1), item.call_id)
      const name = parse(z.string().min(1), item.name)
      if (calls.has(id))
        throw new InteractionsConversionError("Duplicate call_id")
      calls.set(id, name)
      const args =
        item.type === "function_call" ?
          parseArguments(string(item.arguments))
        : { input: string(item.input) }
      return { type: "function_call", id, name, arguments: args }
    }
    case "function_call_output":
    case "custom_tool_call_output": {
      fields(item, "type id call_id name output status")
      const callId = string(item.call_id)
      const name = calls.get(callId) ?? item.name
      if (name === undefined)
        throw new InteractionsConversionError(
          "Tool result requires call history or explicit name",
        )
      if (item.name !== undefined && item.name !== name)
        throw new InteractionsConversionError("Conflicting tool result name")
      return {
        type: "function_result",
        call_id: callId,
        name: string(name),
        result: [{ type: "text", text: messageText(item.output) }],
      }
    }
    case "reasoning": {
      fields(item, "type id summary encrypted_content status")
      return decodeThought(item.encrypted_content)
    }
    default: {
      throw new InteractionsConversionError(
        `Unsupported input: ${String(item.type)}`,
      )
    }
  }
}

function history(
  input: z.infer<typeof requestSchema>["input"],
  instructions?: string,
) {
  const inputItems =
    typeof input === "string" ? [{ role: "user", content: input }] : input
  const system = instructions === undefined ? [] : [instructions]
  const steps: Array<JsonObject> = []
  const calls = new Map<string, string>()
  for (const item of inputItems) {
    if (item.role === "system" || item.role === "developer") {
      fields(item, "type role content")
      if (steps.length > 0)
        throw new InteractionsConversionError(
          "Instruction in middle of history",
        )
      system.push(messageText(item.content))
    } else {
      steps.push(historyItem(item, calls))
    }
  }
  return { steps, system }
}

export function convertResponsesRequestToInteractions(
  value: unknown,
  options: ConversionOptions = {},
): {
  body: JsonObject
  metadata: Record<string, string>
  customTools: Set<string>
} {
  const request = parse(requestSchema, value)
  const { steps, system } = history(request.input, request.instructions)
  const tools = (request.tools ?? []).map((tool) => toolDefinition(tool))
  const names = new Set(tools.map((tool) => string(tool.name)))
  if (names.size !== tools.length)
    throw new InteractionsConversionError("Duplicate tool name")
  const body: JsonObject = {
    model: parse(z.string().min(1), options.upstreamModel ?? request.model),
    input: steps,
    store: request.store ?? true,
  }
  if (system.length > 0) body.system_instruction = system.join("\n\n")
  if (request.stream !== undefined) body.stream = request.stream
  if (
    request.previous_response_id !== null
    && request.previous_response_id !== undefined
  )
    body.previous_interaction_id = request.previous_response_id
  if (request.tools !== undefined) body.tools = tools
  const generation = generationConfig(request, names)
  if (Object.keys(generation).length > 0) body.generation_config = generation
  const metadata = { ...options.metadata }
  if (request.prompt_cache_key !== undefined) {
    if (
      "prompt_cache_key" in metadata
      && metadata.prompt_cache_key !== request.prompt_cache_key
    ) {
      throw new InteractionsConversionError("Conflicting prompt_cache_key")
    }
    metadata.prompt_cache_key = request.prompt_cache_key
  }
  return {
    body,
    metadata,
    customTools: new Set(
      (request.tools ?? [])
        .filter((tool) => tool.type === "custom")
        .map((tool) => string(tool.name)),
    ),
  }
}

export function convertInteractionStep(
  step: JsonObject,
  index: number,
  options: ConversionOptions = {},
): JsonObject | undefined {
  const id = `step_${index}`
  switch (step.type) {
    case "user_input":
    case "function_result": {
      return undefined
    }
    case "model_output": {
      return {
        type: "message",
        id,
        role: "assistant",
        status: "completed",
        content: parse(z.array(textContent), step.content ?? []).map(
          (part) => ({
            type: "output_text",
            text: part.text,
            annotations: [],
          }),
        ),
      }
    }
    case "function_call": {
      const callId = parse(z.string().min(1), step.id)
      const name = parse(z.string().min(1), step.name)
      const args = object(step.arguments)
      if (options.customTools?.has(name)) {
        const custom = parse(z.strictObject({ input: z.string() }), args)
        return {
          type: "custom_tool_call",
          id,
          call_id: callId,
          name,
          input: custom.input,
          status: "completed",
        }
      }
      return {
        type: "function_call",
        id,
        call_id: callId,
        name,
        arguments: JSON.stringify(args),
        status: "completed",
      }
    }
    case "thought": {
      const thought = parse(thoughtSchema, step)
      const payload = JSON.stringify(thought)
      if (Buffer.byteLength(payload) > MAX_DATA_BYTES)
        throw new InteractionsConversionError("Thought exceeds replay limit")
      return {
        type: "reasoning",
        id,
        summary: (thought.summary ?? []).map((part) => ({
          type: "summary_text",
          text: part.text,
        })),
        encrypted_content: `agdata1.${Buffer.from(payload).toString("base64url")}`,
      }
    }
    default: {
      throw new InteractionsConversionError(
        `Unsupported response step: ${String(step.type)}`,
      )
    }
  }
}

function usage(value: unknown): JsonObject | null {
  if (value === null || value === undefined) return null
  const source = object(value)
  const count = (key: string): number | undefined =>
    source[key] === undefined ?
      undefined
    : parse(z.number().int().nonnegative(), source[key])
  const input = count("total_input_tokens")
  const output = count("total_output_tokens")
  const thought = count("total_thought_tokens")
  const cached = count("total_cached_tokens")
  const total = count("total_tokens")
  const result: JsonObject = {}
  if (input !== undefined) result.input_tokens = input
  if (output !== undefined && thought !== undefined)
    result.output_tokens = output + thought
  if (thought !== undefined)
    result.output_tokens_details = { reasoning_tokens: thought }
  if (cached !== undefined)
    result.input_tokens_details = { cached_tokens: cached }
  if (total !== undefined) result.total_tokens = total
  return result
}

export function convertInteractionsResponseToResponses(
  value: unknown,
  options: ConversionOptions = {},
): JsonObject {
  const interaction = object(value)
  const sourceStatus = parse(
    z.enum([
      "completed",
      "requires_action",
      "failed",
      "incomplete",
      "in_progress",
      "cancelled",
    ]),
    interaction.status,
  )
  let status: string = sourceStatus
  if (sourceStatus === "requires_action") status = "completed"
  if (sourceStatus === "cancelled") status = "incomplete"
  const steps = parse(
    z.array(z.record(z.string(), z.unknown())),
    interaction.steps ?? [],
  )
  const output = steps.flatMap((step, index) => {
    const item = convertInteractionStep(step, index, options)
    return item === undefined ? [] : [item]
  })
  const created =
    interaction.created === undefined ?
      undefined
    : Date.parse(string(interaction.created))
  if (created !== undefined && !Number.isFinite(created))
    throw new InteractionsConversionError("Invalid created timestamp")
  return {
    id: string(interaction.id),
    object: "response",
    created_at:
      created === undefined ?
        (options.createdAt ?? 0)
      : Math.floor(created / 1000),
    model: string(options.requestedModel ?? interaction.model),
    status,
    output,
    error:
      status === "failed" ?
        structuredClone(
          interaction.error ?? {
            code: "upstream_error",
            message: "Interaction failed",
          },
        )
      : null,
    incomplete_details:
      status === "incomplete" ?
        { reason: sourceStatus === "cancelled" ? "cancelled" : "unknown" }
      : null,
    usage: usage(interaction.usage),
  }
}

function generationConfig(
  request: z.infer<typeof requestSchema>,
  names: Set<string>,
): JsonObject {
  const generation: JsonObject = {}
  if (request.max_output_tokens !== undefined)
    generation.max_output_tokens = request.max_output_tokens
  if (request.reasoning?.effort !== undefined)
    generation.thinking_level = request.reasoning.effort
  if (request.reasoning?.summary !== undefined)
    generation.thinking_summaries = request.reasoning.summary
  if (request.tool_choice !== undefined)
    generation.tool_choice = toolChoice(request.tool_choice, names)
  return generation
}
