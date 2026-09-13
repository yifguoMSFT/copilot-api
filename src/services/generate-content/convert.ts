import { z } from "zod"

export type JsonObject = Record<string, unknown>

export class GenerateContentConversionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "GenerateContentConversionError"
  }
}

/**
 * Gemini carries one flat function name, so a Responses namespace group is
 * flattened into one declaration per nested tool. The namespace length keeps
 * the flattened name unambiguous, so two different namespace/name pairs never
 * produce one name. Reversing it never parses the name: the caller passes the
 * tool context in.
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
 * Gemini has no reasoning item, so a model turn's opaque state rides in the
 * Responses `encrypted_content` field. The payload is the upstream `parts`
 * array verbatim: a signature only validates against the exact bytes it was
 * issued for, so storing anything less would make replay lossy.
 */
export const STATE_CARRIER_PREFIX = "gcparts1."

const MAX_CARRIER_BYTES = 1_048_576

export interface ConversionOptions {
  cleanSchema?: boolean

  /**
   * Tool identities declared for this request, keyed by upstream function
   * name. The response direction needs them to restore a namespace or a custom
   * tool that the flat upstream name cannot express.
   */
  tools?: ReadonlyMap<string, ToolIdentity>
}

const requestSchema = z.object({
  input: z.union([z.string(), z.array(z.record(z.string(), z.unknown()))]),
  instructions: z.string().optional(),
  // Declared only so a reference this stateless endpoint cannot resolve is
  // refused instead of silently changing the conversation.
  previous_response_id: z.string().nullable().optional(),
  conversation: z.unknown().optional(),
  max_output_tokens: z.number().int().positive().optional(),
  tools: z.array(z.record(z.string(), z.unknown())).optional(),
  tool_choice: z.unknown().optional(),
  reasoning: z
    .object({
      effort: z.enum(["minimal", "low", "medium", "high"]).optional(),
    })
    .optional(),
  text: z.record(z.string(), z.unknown()).optional(),
  parallel_tool_calls: z.boolean().optional(),
})

type Request = z.infer<typeof requestSchema>

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success)
    throw new GenerateContentConversionError(result.error.message)
  return result.data
}

/** Item id scoped to one response, so ids never repeat between responses. */
export function responseItemId(scope: string | undefined, index: number): string {
  return `${scope ?? "step"}_${index}`
}

export function object(value: unknown): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new GenerateContentConversionError("Expected an object")
  return value as JsonObject
}

/** Wraps one model turn's upstream parts as the replayable Responses state. */
export function encodeStateCarrier(parts: Array<JsonObject>): string {
  const payload = JSON.stringify({ parts })
  if (Buffer.byteLength(payload) > MAX_CARRIER_BYTES)
    throw new GenerateContentConversionError("Model state exceeds carrier limit")
  return `${STATE_CARRIER_PREFIX}${Buffer.from(payload).toString("base64url")}`
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

/**
 * Key-order independent part identity. It is used only to notice that a
 * replayed call is already inside the carrier parts of the same turn, so the
 * same call is not sent twice.
 */
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value))
    return `[${value.map((item) => canonical(item)).join(",")}]`
  const entries = Object.entries(value as JsonObject).sort(([a], [b]) =>
    a.localeCompare(b),
  )
  const fields = entries.map(
    ([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`,
  )
  return `{${fields.join(",")}}`
}

function decodeCarrier(value: unknown): Array<JsonObject> {
  const encoded = typeof value === "string" ? value : ""
  if (
    !encoded.startsWith(STATE_CARRIER_PREFIX)
    || encoded.length > MAX_CARRIER_BYTES * 2
  )
    throw new GenerateContentConversionError("Unsupported model state carrier")
  const payload = encoded.slice(STATE_CARRIER_PREFIX.length)
  if (!/^[\w-]+$/.test(payload))
    throw new GenerateContentConversionError("Invalid state carrier encoding")
  const bytes = Buffer.from(payload, "base64url")
  if (
    bytes.length > MAX_CARRIER_BYTES
    || bytes.toString("base64url") !== payload
  )
    throw new GenerateContentConversionError(
      "Invalid state carrier size or encoding",
    )
  try {
    return parse(
      z.looseObject({ parts: z.array(z.record(z.string(), z.unknown())) }),
      JSON.parse(bytes.toString("utf8")),
    ).parts
  } catch {
    throw new GenerateContentConversionError("Invalid state carrier data")
  }
}

/** Responses carries the namespace beside the name; upstream carries one string. */
function toolCallName(name: unknown, namespace: unknown): string {
  const bare = parse(z.string().min(1), name)
  if (namespace === undefined) return bare
  return qualifiedToolName(parse(z.string().min(1), namespace), bare)
}

function argumentsObject(value: unknown): JsonObject {
  const raw = parse(z.string(), value)
  if (raw === "") return {}
  try {
    return object(JSON.parse(raw))
  } catch {
    throw new GenerateContentConversionError(
      "Tool arguments must be a JSON object",
    )
  }
}


function cleanGeminiSchema(schema: unknown, defs: Record<string, unknown> = {}): unknown {
  if (!schema || typeof schema !== "object") return schema
  if (Array.isArray(schema)) return schema.map(x => cleanGeminiSchema(x, defs))

  const obj = { ...(schema as Record<string, unknown>) }

  // Resolve $defs / definitions
  if (obj.$defs && typeof obj.$defs === "object") {
    Object.assign(defs, obj.$defs)
    delete obj.$defs
  }
  if (obj.definitions && typeof obj.definitions === "object") {
    Object.assign(defs, obj.definitions)
    delete obj.definitions
  }

  // Resolve $ref if present
  if (typeof obj.$ref === "string") {
    const refPath = obj.$ref
    delete obj.$ref
    const match = refPath.match(/^#\/(\$defs|definitions)\/(.+)$/)
    if (match && defs[match[2]]) {
      const resolved = cleanGeminiSchema(defs[match[2]], defs)
      if (resolved && typeof resolved === "object" && !Array.isArray(resolved)) {
        Object.assign(obj, resolved)
      }
    }
  }

  // Strip non-standard schema keywords rejected by Google Cloud Code
  delete obj.encrypted

  for (const [key, val] of Object.entries(obj)) {
    obj[key] = cleanGeminiSchema(val, defs)
  }
  return obj
}

function toolDefinition(tool: JsonObject, options?: ConversionOptions): JsonObject {
  const name = parse(z.string().min(1), tool.name)
  if (
    tool.strict !== undefined
    && tool.strict !== null
    && tool.strict !== false
  )
    throw new GenerateContentConversionError("strict tools are not supported")
  const result: JsonObject = { name }
  if (tool.description !== undefined)
    result.description = parse(z.string(), tool.description)
  if (tool.type === "custom") {
    // Custom tool format may be text or grammar (e.g. lark)
    if (tool.format !== undefined)
      parse(z.object({ type: z.string() }), tool.format)
    if (tool.parameters !== undefined)
      throw new GenerateContentConversionError(
        "custom tool cannot specify parameters",
      )
    // A Responses custom tool takes one free-form string. Gemini declares
    // functions, so the same input is declared as a single string parameter.
    result.parameters = {
      type: "object",
      properties: { input: { type: "string" } },
      required: ["input"],
    }
  } else if (tool.type === "function") {
    if (tool.format !== undefined)
      throw new GenerateContentConversionError("Unsupported function format")
    // The declared schema travels unchanged. Gemini documents an OpenAPI
    // subset, but dropping keywords here would silently rewrite a client
    // schema, so an unsupported keyword has to surface upstream instead.
    result.parameters = options?.cleanSchema === true ? (cleanGeminiSchema(structuredClone(object(tool.parameters))) as JsonObject) : structuredClone(object(tool.parameters))
  } else {
    throw new GenerateContentConversionError(
      `Unsupported tool: ${String(tool.type)}`,
    )
  }
  return result
}

interface FlattenedTools {
  declarations: Array<JsonObject>
  tools: Map<string, ToolIdentity>
}

/**
 * Codex declares tools it adds mid-conversation as `additional_tools` input
 * items. A top-level tool wins, so an extra declaration never replaces one
 * the request already made.
 */
function mergeAdditionalTools(
  tools: ReadonlyArray<JsonObject>,
  items: Request["input"],
): Array<JsonObject> {
  if (!Array.isArray(items)) return [...tools]
  const declared = new Set(
    tools.flatMap((tool) => (typeof tool.name === "string" ? [tool.name] : [])),
  )
  const merged = [...tools]
  for (const item of items) {
    if (item.type !== "additional_tools") continue
    const additional = parse(
      z.array(z.record(z.string(), z.unknown())).optional(),
      item.tools,
    )
    for (const tool of additional ?? []) {
      const name = typeof tool.name === "string" ? tool.name : undefined
      if (name !== undefined) {
        if (declared.has(name)) continue
        declared.add(name)
      }
      merged.push(tool)
    }
  }
  return merged
}

function flattenTools(tools: ReadonlyArray<JsonObject>, options?: ConversionOptions): FlattenedTools {
  const result: FlattenedTools = { declarations: [], tools: new Map() }
  for (const tool of tools) {
    if (tool.type === "web_search") {
      // Client-side web_search tool without name is ignored for function declarations
      continue
    }
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
          throw new GenerateContentConversionError("Duplicate tool name")
        result.declarations.push(toolDefinition({ ...child, name: upstream }, options))
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
      throw new GenerateContentConversionError("Duplicate tool name")
    result.declarations.push(toolDefinition(tool, options))
    result.tools.set(name, { name, custom: tool.type === "custom" })
  }
  return result
}

/**
 * A Responses tool result is a string, and Gemini's `functionResponse`
 * requires an object. Wrapping the exact string under `output` keeps the
 * mapping deterministic and reversible; parsing it as JSON would make the
 * reverse direction depend on a guess.
 */
function toolResultPart(
  item: JsonObject,
  calls: Map<string, string>,
): JsonObject {
  const callId = parse(z.string().min(1), item.call_id)
  const known = calls.get(callId)
  const explicit =
    item.name === undefined ?
      undefined
    : toolCallName(item.name, item.namespace)
  if (explicit !== undefined && known !== undefined && explicit !== known)
    throw new GenerateContentConversionError("Conflicting tool result name")
  const name = known ?? explicit
  if (name === undefined)
    throw new GenerateContentConversionError(
      "Tool result requires call history or explicit name",
    )
  return {
    functionResponse: {
      name,
      response: { output: messageTexts(item.output).join("") },
    },
  }
}

interface Contents {
  contents: Array<JsonObject>
  system: Array<string>
}

interface ContentsState extends Contents {
  calls: Map<string, string>
  // Parts already contributed by a carrier in the current model turn.
  carrierParts: Array<JsonObject>
}

function pushPart(
  state: ContentsState,
  role: "user" | "model",
  parts: Array<JsonObject>,
): void {
  if (parts.length === 0) return
  // One Responses item is one user turn, so user items never merge. A model
  // turn, by contrast, arrives as several items (reasoning, message, calls)
  // that all belong to the single content entry upstream produced.
  if (role === "user") {
    state.carrierParts = []
    state.contents.push({ role, parts })
    return
  }
  const last = state.contents.at(-1)
  if (last !== undefined && last.role === role) {
    const existing = last.parts as Array<JsonObject>
    existing.push(...parts)
    return
  }
  state.contents.push({ role, parts })
}

function pushModelPart(state: ContentsState, parts: Array<JsonObject>): void {
  // A carried turn already holds these exact parts, so replaying both would
  // send the same call twice.
  const fresh = parts.filter(
    (part) =>
      !state.carrierParts.some((held) => canonical(held) === canonical(part)),
  )
  pushPart(state, "model", fresh)
}

function callPart(item: JsonObject, calls: Map<string, string>): JsonObject {
  const callId = parse(z.string().min(1), item.call_id)
  const name = parse(z.string().min(1), toolCallName(item.name, item.namespace))
  if (calls.has(callId))
    throw new GenerateContentConversionError("Duplicate call_id")
  calls.set(callId, name)
  const args =
    item.type === "function_call" ?
      argumentsObject(item.arguments)
    : { input: parse(z.string(), item.input) }
  const res: JsonObject = { functionCall: { name, args } }
  if (typeof item.thought_signature === "string" && item.thought_signature !== "") {
    res.thoughtSignature = item.thought_signature
  }
  return res
}

function applyItem(state: ContentsState, item: JsonObject): void {
  // Tools added mid-conversation travel as their own input item, so the
  // caller merges the declarations and the item stays out of the history.
  if (item.type === "additional_tools") return
  if (item.role === "system" || item.role === "developer") {
    const text = messageTexts(item.content).join("")
    // GenerateContent has no developer role, so an instruction that arrives
    // after the conversation started stays where it appeared, as user text.
    if (state.contents.length > 0) {
      pushPart(state, "user", [{ text }])
      return
    }
    state.system.push(text)
    return
  }
  switch (item.type) {
    case undefined:
    case "message": {
      const role = parse(z.enum(["user", "assistant"]), item.role)
      const parts = messageTexts(item.content).map((text) => ({ text }))
      if (role === "user") pushPart(state, "user", parts)
      else pushModelPart(state, parts)
      return
    }
    case "function_call":
    case "custom_tool_call": {
      pushModelPart(state, [callPart(item, state.calls)])
      return
    }
    case "function_call_output":
    case "custom_tool_call_output": {
      pushPart(state, "user", [toolResultPart(item, state.calls)])
      return
    }
    case "reasoning": {
      // Other providers' opaque state cannot be decoded or replayed by Gemini.
      // Keep their readable summaries; only decode carriers we produced.
      if (
        typeof item.encrypted_content !== "string"
        || !item.encrypted_content.startsWith(STATE_CARRIER_PREFIX)
      ) {
        const summary = parse(
          z.array(z.object({ text: z.string() })),
          item.summary ?? [],
        )
        pushPart(state, "model", summary.map(({ text }) => ({ text, thought: true })))
        return
      }
      const parts = decodeCarrier(item.encrypted_content)
      state.carrierParts = parts
      pushPart(state, "model", parts)
      return
    }
    case "item_reference":
    case "compaction": {
      throw new GenerateContentConversionError(
        `${item.type} has no GenerateContent equivalent`,
      )
    }
    default: {
      throw new GenerateContentConversionError(
        `Unsupported input: ${String(item.type)}`,
      )
    }
  }
}

/**
 * Builds the alternating `contents` array. Consecutive items that belong to
 * one side of the conversation become one content entry, which is how a model
 * turn keeps its parts in the order the client sent them.
 */
function buildContents(request: Request): Contents {
  const inputItems =
    typeof request.input === "string" ?
      [{ role: "user", content: request.input }]
    : request.input
  const system: Array<string> =
    request.instructions === undefined ? [] : [request.instructions]
  const state: ContentsState = {
    contents: [],
    system,
    calls: new Map(),
    carrierParts: [],
  }
  for (const item of inputItems) applyItem(state, item)
  return { contents: state.contents, system }
}

function toolConfig(
  value: unknown,
  names: ReadonlySet<string>,
): JsonObject | undefined {
  if (value === undefined) return undefined
  if (typeof value === "string") {
    switch (value) {
      case "auto": {
        return { mode: "AUTO" }
      }
      case "none": {
        return { mode: "NONE" }
      }
      case "required": {
        return { mode: "ANY" }
      }
      default: {
        throw new GenerateContentConversionError(
          `Unsupported tool_choice: ${value}`,
        )
      }
    }
  }
  const choice = parse(
    z.object({
      type: z.enum(["function", "custom"]),
      name: z.string(),
      namespace: z.string().optional(),
    }),
    value,
  )
  const name =
    choice.namespace === undefined ?
      choice.name
    : qualifiedToolName(choice.namespace, choice.name)
  if (!names.has(name))
    throw new GenerateContentConversionError("Unknown chosen tool")
  return { mode: "ANY", allowedFunctionNames: [name] }
}

function generationConfig(
  request: Request,
): JsonObject {
  const generation: JsonObject = {}
  if (request.max_output_tokens !== undefined)
    generation.maxOutputTokens = request.max_output_tokens
  // Thought parts carry the signatures the next turn has to replay, so they
  // stay requested. The effort level itself has no confirmed field on this
  // path, so it is not translated into a number.
  if (request.reasoning !== undefined)
    generation.thinkingConfig = { includeThoughts: true }
  return generation
}

/**
 * Refuses a reference this stateless endpoint cannot resolve: Gemini keeps no
 * server-side conversation, and a blank id could not identify one anyway.
 */
function assertResolvable(request: Request): void {
  if (request.conversation !== undefined && request.conversation !== null)
    throw new GenerateContentConversionError(
      "conversation has no GenerateContent equivalent; pass the full history",
    )
  const parent = request.previous_response_id
  if (parent !== undefined && parent !== null)
    throw new GenerateContentConversionError(
      "previous_response_id cannot be resolved upstream; pass the full history",
    )
  if (request.parallel_tool_calls === false)
    throw new GenerateContentConversionError(
      "parallel_tool_calls=false has no GenerateContent equivalent",
    )
}

/**
 * Responses request -> Gemini GenerateContent request body.
 *
 * Only the payload is returned. The Cloud Code envelope, the model field and
 * the HTTP target belong to the adapter, so this stays a pure protocol mapping
 * over its arguments.
 */
export function convertResponsesRequestToGenerateContent(
  value: unknown,
  options: ConversionOptions = {},
): {
  body: JsonObject
  tools: Map<string, ToolIdentity>
} {
  const request = parse(requestSchema, value)
  assertResolvable(request)
  const { contents, system } = buildContents(request)
  const declared = mergeAdditionalTools(request.tools ?? [], request.input)
  const flattened = flattenTools(declared, options)
  const body: JsonObject = { contents }
  if (system.length > 0)
    body.systemInstruction = { parts: system.map((text) => ({ text })) }
  if (flattened.declarations.length > 0)
    body.tools = [{ functionDeclarations: flattened.declarations }]
  const config = toolConfig(request.tool_choice, new Set(flattened.tools.keys()))
  if (config !== undefined)
    body.toolConfig = { functionCallingConfig: config }
  else if (declared.length > 0)
    body.toolConfig = { functionCallingConfig: { mode: "AUTO" } }
  const generation = generationConfig(request)
  if (Object.keys(generation).length > 0) body.generationConfig = generation
  return {
    body,
    tools: new Map([...(options.tools ?? []), ...flattened.tools]),
  }
}
