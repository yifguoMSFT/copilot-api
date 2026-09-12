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
 * flattened into one Function per nested tool. The namespace length keeps the
 * flattened name unambiguous, so two different namespace/name pairs never
 * produce one name. The leading underscore keeps the result inside the
 * documented function-name rule for the upstream APIs (a letter or underscore
 * first, then letters, digits, underscores and dashes). Reversing it never
 * parses the name: it uses the tool context the caller passes in.
 */
export function qualifiedToolName(namespace: string, name: string): string {
  return `_${namespace.length}_${namespace}${name}`
}

/** Everything needed to restore one function call the client declared. */
export interface ToolIdentity {
  /** Function name the client declared, without any namespace. */
  name: string
  /** Responses namespace the function was flattened from, if any. */
  namespace?: string
  /** Whether the declared tool was a Responses custom tool. */
  custom: boolean
}

/**
 * Item id scoped to one response. The scope keeps ids from repeating between
 * responses while every item of one response stays stable.
 */
export function responseItemId(
  scope: string | undefined,
  index: number,
): string {
  return `${scope ?? "step"}_${index}`
}

const textContent = z.strictObject({
  type: z.literal("text"),
  text: z.string(),
})
/**
 * A thought is replayed verbatim, so its schema checks the fields this
 * converter reads and keeps every other upstream field instead of rejecting
 * the step. Only the type of the fields used here is enforced.
 */
const thoughtText = z.looseObject({
  type: z.literal("text"),
  text: z.string(),
})
const thoughtSchema = z.looseObject({
  type: z.literal("thought"),
  signature: z.string().optional(),
  summary: z.array(thoughtText).optional(),
})
const requestSchema = z.object({
  model: z.string().min(1),
  input: z.union([z.string(), z.array(z.record(z.string(), z.unknown()))]),
  instructions: z.string().optional(),
  stream: z.boolean().optional(),
  store: z.boolean().optional(),
  previous_response_id: z.string().nullable().optional(),
  // Declared only so a persistent conversation is rejected instead of being
  // silently stripped, which would drop the context it selects.
  conversation: z.unknown().optional(),
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
  /**
   * Tool identities declared by the request, keyed by upstream function name.
   * A call that is not listed is refused instead of guessed: Interactions
   * cannot express a namespace or a custom tool, so the name alone is not
   * enough to restore what the client declared.
   */
  tools?: ReadonlyMap<string, ToolIdentity>
  /**
   * Caller context kept beside the request. It is never written into the
   * upstream body, because Interactions has no field with this meaning.
   */
  metadata?: Readonly<Record<string, unknown>>
  createdAt?: number
  /**
   * Scope of the generated item ids. Callers that convert the same response
   * twice can pin it; otherwise each response gets its own scope.
   */
  itemIdScope?: string
}

let responseSequence = 0

/**
 * Item ids must not repeat between responses, but Interactions carries no item
 * id for messages and thoughts. The upstream interaction id is unique when it
 * exists; live v1 responses may omit it, so a process-local sequence keeps
 * consecutive responses independent without storing any conversation state.
 */
export function nextResponseScope(interactionId: string): string {
  if (interactionId !== "") return interactionId
  responseSequence += 1
  return `response_${responseSequence.toString(36)}`
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

/** Text of each Responses content block, in order; a string is one block. */
function messageTexts(content: unknown): Array<string> {
  if (typeof content === "string") return [content]
  return parse(
    z.array(
      z.object({
        type: z.enum(["input_text", "output_text"]),
        text: z.string(),
      }),
    ),
    content,
  ).map((part) => part.text)
}

function messageText(content: unknown): string {
  return messageTexts(content).join("")
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
        // One text block per Responses content block. Responses-only fields
        // (phase, status, item id) have no Interactions equivalent and are
        // dropped rather than folded into the text.
        type: role === "user" ? "user_input" : "model_output",
        content: messageTexts(item.content).map((text) => ({
          type: "text",
          text,
        })),
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
    case "item_reference":
    case "compaction": {
      throw new InteractionsConversionError(
        `${item.type} has no Interactions equivalent`,
      )
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
 *
 * A turn runs between the explicit boundaries the client sent: user input and
 * tool results (the only non-model steps this converter emits). The only
 * adjustment inside a turn is lifting its thought blocks ahead of the rest;
 * the relative order of the thoughts and of the remaining steps is unchanged,
 * so nothing else about the client's history is rewritten.
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
  tools: Map<string, ToolIdentity>
}

function flattenTools(tools: ReadonlyArray<JsonObject>): FlattenedTools {
  const result: FlattenedTools = {
    definitions: [],
    tools: new Map(),
  }
  for (const tool of tools) {
    if (tool.type === "namespace") {
      const namespace = parse(z.string().min(1), tool.name)
      const nested = parse(
        z.array(z.record(z.string(), z.unknown())),
        tool.tools,
      )
      for (const child of nested) {
        const name = parse(z.string().min(1), child.name)
        const upstream = qualifiedToolName(namespace, name)
        if (result.tools.has(upstream))
          throw new InteractionsConversionError("Duplicate tool name")
        result.definitions.push(toolDefinition({ ...child, name: upstream }))
        result.tools.set(upstream, {
          name,
          namespace,
          custom: child.type === "custom",
        })
      }
      continue
    }
    const name = parse(z.string().min(1), tool.name)
    if (result.tools.has(name))
      throw new InteractionsConversionError("Duplicate tool name")
    result.definitions.push(toolDefinition(tool))
    result.tools.set(name, { name, custom: tool.type === "custom" })
  }
  return result
}

/**
 * Resolves the continuation reference. A persistent conversation selects
 * server-side context that Interactions cannot address, and a blank id cannot
 * resolve an interaction, so both are refused instead of silently changing the
 * request.
 */
function continuationParentId(
  request: z.infer<typeof requestSchema>,
): string | undefined {
  if (request.conversation !== undefined && request.conversation !== null)
    throw new InteractionsConversionError(
      "conversation has no Interactions equivalent; pass the full history or previous_response_id",
    )
  const parentId = request.previous_response_id ?? undefined
  if (parentId !== undefined && parentId.trim() === "")
    throw new InteractionsConversionError(
      "previous_response_id must be a non-empty interaction id",
    )
  return parentId
}

export function convertResponsesRequestToInteractions(
  value: unknown,
  options: ConversionOptions = {},
): {
  body: JsonObject
  metadata: Record<string, unknown>
  tools: Map<string, ToolIdentity>
} {
  const request = parse(requestSchema, value)
  if (request.parallel_tool_calls === false)
    throw new InteractionsConversionError(
      "parallel_tool_calls=false has no Interactions equivalent",
    )
  const parentId = continuationParentId(request)
  const { steps, system } = history(
    request.input,
    request.instructions,
    parentId !== undefined,
  )
  const flattened = flattenTools(request.tools ?? [])
  const tools = flattened.definitions
  const names = new Set(flattened.tools.keys())
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
  const metadata: Record<string, unknown> = { ...options.metadata }
  if (request.prompt_cache_key !== undefined) {
    if (
      "prompt_cache_key" in metadata
      && metadata.prompt_cache_key !== request.prompt_cache_key
    ) {
      throw new InteractionsConversionError("Conflicting prompt_cache_key")
    }
    metadata.prompt_cache_key = request.prompt_cache_key
  }
  // The payload's own client metadata has no Interactions counterpart, so it
  // stays caller context and is copied rather than aliased to the input.
  if (request.client_metadata !== undefined)
    metadata.client_metadata = structuredClone(request.client_metadata)
  return {
    body,
    metadata,
    tools: flattened.tools,
  }
}

export function convertInteractionStep(
  step: JsonObject,
  index: number,
  options: ConversionOptions = {},
): JsonObject | undefined {
  const id = responseItemId(options.itemIdScope, index)
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
      const identity = options.tools?.get(upstream)
      // Neither a namespace nor a custom tool is expressible upstream, so the
      // declared context is required; a name is never re-interpreted.
      if (identity === undefined)
        throw new InteractionsConversionError(
          `Tool call ${upstream} is not in the declared tools`,
        )
      const grouped =
        identity.namespace === undefined ?
          {}
        : { namespace: identity.namespace }
      const args = object(step.arguments)
      if (identity.custom) {
        const custom = parse(z.object({ input: z.string() }), args)
        return {
          type: "custom_tool_call",
          id,
          call_id: callId,
          name: identity.name,
          ...grouped,
          input: custom.input,
          status: "completed",
        }
      }
      return {
        type: "function_call",
        id,
        call_id: callId,
        name: identity.name,
        ...grouped,
        arguments: JSON.stringify(args),
        status: "completed",
      }
    }
    case "thought": {
      const thought = parse(thoughtSchema, step)
      const item: JsonObject = {
        type: "reasoning",
        id,
        summary: (thought.summary ?? []).map((part) => ({
          type: "summary_text",
          text: part.text,
        })),
      }
      // Only a signed thought is replayable; a summary-only fragment keeps its
      // text but must not be wrapped into a replay envelope.
      if (thought.signature === undefined) return item
      const payload = JSON.stringify(thought)
      if (Buffer.byteLength(payload) > MAX_DATA_BYTES)
        throw new InteractionsConversionError("Thought exceeds replay limit")
      return {
        ...item,
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

/** Maps upstream v1 counters onto the Responses usage shape. */
export function responsesUsage(value: unknown): JsonObject | null {
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
  // Live v1 JSON responses omit id entirely; the SSE path reports an empty id
  // in that case, so both directions stay consistent.
  const responseId = interaction.id === undefined ? "" : string(interaction.id)
  const itemOptions: ConversionOptions = {
    ...options,
    itemIdScope: options.itemIdScope ?? nextResponseScope(responseId),
  }
  const output = steps.flatMap((step, index) => {
    const item = convertInteractionStep(step, index, itemOptions)
    return item === undefined ? [] : [item]
  })
  const created =
    interaction.created === undefined ?
      undefined
    : Date.parse(string(interaction.created))
  if (created !== undefined && !Number.isFinite(created))
    throw new InteractionsConversionError("Invalid created timestamp")
  return {
    id: responseId,
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
    usage: responsesUsage(interaction.usage),
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
