import { z } from "zod"

export type JsonObject = Record<string, unknown>

export class InteractionsConversionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "InteractionsConversionError"
  }
}

export const MAX_DATA_BYTES = 1_048_576
/**
 * Functions cannot be grouped upstream, so a Responses namespace tool group is
 * flattened into one Function per nested tool. The qualified name is reversed
 * on the way back using the namespaces declared by the same request.
 */
export const NAMESPACE_SEPARATOR = "__"

export function qualifiedToolName(namespace: string, name: string): string {
  return `${namespace}${NAMESPACE_SEPARATOR}${name}`
}

const textContent = z.strictObject({
  type: z.literal("text"),
  text: z.string(),
})
const thoughtSchema = z.strictObject({
  type: z.literal("thought"),
  signature: z.string().optional(),
  summary: z.array(textContent).optional(),
})
const requestSchema = z.object({
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
    .object({
      effort: z.enum(["minimal", "low", "medium", "high"]).optional(),
      summary: z.literal("auto").optional(),
    })
    .optional(),
  text: z
    .object({
      format: z.object({ type: z.literal("text") }).optional(),
    })
    .optional(),
  include: z.array(z.literal("reasoning.encrypted_content")).optional(),
  parallel_tool_calls: z.boolean().optional(),
  client_metadata: z.record(z.string(), z.unknown()).optional(),
  prompt_cache_key: z.string().optional(),
})

export interface ConversionOptions {
  upstreamModel?: string
  requestedModel?: string
  customTools?: ReadonlySet<string>
  /** Upstream Function name to the Responses namespace it was flattened from. */
  toolNamespaces?: ReadonlyMap<string, string>
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

function messageText(content: unknown): string {
  if (typeof content === "string") return content
  return parse(
    z.array(
      z.object({
        type: z.enum(["input_text", "output_text"]),
        text: z.string(),
      }),
    ),
    content,
  )
    .map((part) => part.text)
    .join("")
}

function toolDefinition(tool: JsonObject): JsonObject {
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
      parse(z.object({ type: z.literal("text") }), tool.format)
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
    z.object({
      type: z.enum(["function", "custom"]),
      name: z.string(),
      // Declared only when the tool came from a namespace group.
      namespace: z.string().optional(),
    }),
    value,
  )
  const name =
    choice.namespace === undefined ?
      choice.name
    : qualifiedToolName(choice.namespace, choice.name)
  if (!names.has(name))
    throw new InteractionsConversionError("Unknown chosen tool")
  return { allowed_tools: { mode: "any", tools: [name] } }
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

function toolResult(
  item: JsonObject,
  calls: Map<string, string>,
  parentReferenced: boolean,
): JsonObject {
  const callId = string(item.call_id)
  const known = calls.get(callId)
  const explicit =
    item.name === undefined ?
      undefined
    : toolCallName(item.name, item.namespace)
  if (explicit !== undefined && known !== undefined && explicit !== known)
    throw new InteractionsConversionError("Conflicting tool result name")
  const name = known ?? explicit
  // previous_interaction_id continuation keeps the call history server side, so
  // an orphaned result may legitimately omit the tool name.
  if (name === undefined && !parentReferenced)
    throw new InteractionsConversionError(
      "Tool result requires call history or explicit name",
    )
  return {
    type: "function_result",
    call_id: callId,
    ...(name === undefined ? {} : { name }),
    result: [{ type: "text", text: messageText(item.output) }],
  }
}

/** Responses carries the namespace beside the name; upstream carries one string. */
function toolCallName(name: unknown, namespace: unknown): string {
  const bare = string(name)
  return namespace === undefined ? bare : (
      qualifiedToolName(string(namespace), bare)
    )
}

function historyItem(
  item: JsonObject,
  calls: Map<string, string>,
  parentReferenced: boolean,
): JsonObject {
  switch (item.type) {
    case undefined:
    case "message": {
      const role = parse(z.enum(["user", "assistant"]), item.role)
      return {
        type: role === "user" ? "user_input" : "model_output",
        content: [{ type: "text", text: messageText(item.content) }],
      }
    }
    case "function_call":
    case "custom_tool_call": {
      const id = parse(z.string().min(1), item.call_id)
      const name = parse(
        z.string().min(1),
        toolCallName(item.name, item.namespace),
      )
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
      return toolResult(item, calls, parentReferenced)
    }
    case "reasoning": {
      return decodeThought(item.encrypted_content)
    }
    default: {
      throw new InteractionsConversionError(
        `Unsupported input: ${String(item.type)}`,
      )
    }
  }
}

const MODEL_TURN_STEPS = new Set(["model_output", "function_call", "thought"])

/**
 * Google rejects a model turn whose thought block is not its first step
 * ("Model turns with thought summaries must start with a thought block").
 * Codex appends the reasoning item after the message and tool calls it
 * produced, so each model turn is emitted with its thought blocks first.
 */
function leadWithThoughts(steps: Array<JsonObject>): Array<JsonObject> {
  const ordered: Array<JsonObject> = []
  let turn: Array<JsonObject> = []
  const endTurn = () => {
    if (turn.length > 0)
      ordered.push(
        ...turn.filter((step) => step.type === "thought"),
        ...turn.filter((step) => step.type !== "thought"),
      )
    turn = []
  }
  for (const step of steps) {
    if (MODEL_TURN_STEPS.has(String(step.type))) turn.push(step)
    else {
      endTurn()
      ordered.push(step)
    }
  }
  endTurn()
  return ordered
}

function history(
  input: z.infer<typeof requestSchema>["input"],
  instructions?: string,
  parentReferenced = false,
) {
  const inputItems =
    typeof input === "string" ? [{ role: "user", content: input }] : input
  const system = instructions === undefined ? [] : [instructions]
  const steps: Array<JsonObject> = []
  const calls = new Map<string, string>()
  for (const item of inputItems) {
    if (item.role === "system" || item.role === "developer") {
      if (steps.length > 0)
        throw new InteractionsConversionError(
          "Instruction in middle of history",
        )
      system.push(messageText(item.content))
    } else {
      steps.push(historyItem(item, calls, parentReferenced))
    }
  }
  return { steps: leadWithThoughts(steps), system }
}

interface FlattenedTools {
  definitions: Array<JsonObject>
  custom: Set<string>
  namespaces: Map<string, string>
}

function flattenTools(tools: ReadonlyArray<JsonObject>): FlattenedTools {
  const result: FlattenedTools = {
    definitions: [],
    custom: new Set(),
    namespaces: new Map(),
  }
  for (const tool of tools) {
    if (tool.type === "namespace") {
      const namespace = parse(z.string().min(1), tool.name)
      const nested = parse(
        z.array(z.record(z.string(), z.unknown())),
        tool.tools,
      )
      for (const child of nested) {
        const name = qualifiedToolName(
          namespace,
          parse(z.string().min(1), child.name),
        )
        result.definitions.push(toolDefinition({ ...child, name }))
        result.namespaces.set(name, namespace)
        if (child.type === "custom") result.custom.add(name)
      }
      continue
    }
    result.definitions.push(toolDefinition(tool))
    if (tool.type === "custom") result.custom.add(string(tool.name))
  }
  return result
}

export function convertResponsesRequestToInteractions(
  value: unknown,
  options: ConversionOptions = {},
): {
  body: JsonObject
  metadata: Record<string, string>
  customTools: Set<string>
  toolNamespaces: Map<string, string>
} {
  const request = parse(requestSchema, value)
  if (request.parallel_tool_calls === false)
    throw new InteractionsConversionError(
      "parallel_tool_calls=false has no Interactions equivalent",
    )
  const parentId = request.previous_response_id ?? undefined
  const { steps, system } = history(
    request.input,
    request.instructions,
    parentId !== undefined,
  )
  const flattened = flattenTools(request.tools ?? [])
  const tools = flattened.definitions
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
  if (parentId !== undefined) body.previous_interaction_id = parentId
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
    customTools: flattened.custom,
    toolNamespaces: flattened.namespaces,
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
      const upstream = parse(z.string().min(1), step.name)
      const namespace = options.toolNamespaces?.get(upstream)
      const name =
        namespace === undefined ? upstream : (
          upstream.slice(namespace.length + NAMESPACE_SEPARATOR.length)
        )
      const grouped = namespace === undefined ? {} : { namespace }
      const args = object(step.arguments)
      if (options.customTools?.has(upstream)) {
        const custom = parse(z.object({ input: z.string() }), args)
        return {
          type: "custom_tool_call",
          id,
          call_id: callId,
          name,
          ...grouped,
          input: custom.input,
          status: "completed",
        }
      }
      return {
        type: "function_call",
        id,
        call_id: callId,
        name,
        ...grouped,
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

function failureError(interaction: JsonObject): JsonObject {
  const diagnostics =
    Array.isArray(interaction.errors) ? interaction.errors : []
  let diagnostic: JsonObject | undefined
  for (const entry of diagnostics) {
    if (entry !== null && typeof entry === "object" && !Array.isArray(entry)) {
      diagnostic = entry as JsonObject
      break
    }
  }
  if (diagnostic === undefined && interaction.error !== undefined)
    diagnostic = object(interaction.error)
  return {
    code:
      typeof diagnostic?.code === "string" && diagnostic.code !== "" ?
        diagnostic.code
      : "upstream_error",
    message:
      typeof diagnostic?.message === "string" && diagnostic.message !== "" ?
        diagnostic.message
      : "Interaction failed",
  }
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
    // Live v1 JSON responses omit id entirely; the SSE path already reports an
    // empty id in that case, so both directions stay consistent.
    id: interaction.id === undefined ? "" : string(interaction.id),
    object: "response",
    created_at:
      created === undefined ?
        (options.createdAt ?? 0)
      : Math.floor(created / 1000),
    model: string(options.requestedModel ?? interaction.model),
    status,
    output,
    error: status === "failed" ? failureError(interaction) : null,
    // Interactions exposes no legal Responses incomplete reason, and the
    // Responses enum accepts only max_output_tokens, max_messages,
    // content_filter or steered. Report incompleteness through status alone.
    incomplete_details: null,
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
