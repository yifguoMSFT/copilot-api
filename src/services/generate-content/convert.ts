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
export function responseItemId(scope: string | undefined, index: number, prefix?: string): string {
  const base = `${scope ?? "step"}_${index}`
  return prefix ? `${prefix}_${base}` : base
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

/**
 * The model's opaque replay signature, in either spelling it can arrive in.
 * A carried part holds one; the same content replayed by the client as its own
 * Responses item does not, so the field has to stay out of the comparison.
 */
const SIGNATURE_FIELDS = ["thoughtSignature", "thought_signature"] as const

/**
 * A part reduced to what a Responses item can express. The upstream assigns
 * its own `functionCall.id`, and a Responses `function_call` reports a
 * synthesized `call_id` instead, so name and arguments are all that survive a
 * round trip. The signature has no Responses counterpart at all.
 */
function partIdentity(part: JsonObject): JsonObject {
  const copy = { ...part }
  for (const field of SIGNATURE_FIELDS) delete copy[field]
  const call = copy.functionCall
  if (call !== null && typeof call === "object" && !Array.isArray(call)) {
    const rest = { ...(call as JsonObject) }
    delete rest.id
    copy.functionCall = rest
  }
  return copy
}

/**
 * Whether a carried part and a replayed part describe the same model output.
 * The carried part is authoritative: it is the only side holding the signature
 * the upstream validates, so it must win instead of being sent alongside a
 * bare copy of itself.
 */
function isSamePart(carried: JsonObject, candidate: JsonObject): boolean {
  return canonical(partIdentity(carried)) === canonical(partIdentity(candidate))
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
    // The declared schema travels unchanged. It is declared as JSON Schema
    // because the legacy `parameters` proto rejects `const` and any enum
    // member that is not a string, while `parametersJsonSchema` accepts the
    // schema as written and still types the arguments the model emits.
    result.parametersJsonSchema = options?.cleanSchema === true ? (cleanGeminiSchema(structuredClone(object(tool.parameters))) as JsonObject) : structuredClone(object(tool.parameters))
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
 * items. A tool the request already declared wins, so an extra declaration
 * never replaces one the request already made. A namespace is a group: only
 * the children that are still new are kept, which is what lets a later batch
 * extend a namespace the request already opened.
 */
function collectToolNames(tool: JsonObject, names: Set<string>): void {
  const name = typeof tool.name === "string" ? tool.name : undefined
  if (name === undefined || name === "") return
  if (tool.type !== "namespace") {
    names.add(name)
    return
  }
  if (!Array.isArray(tool.tools)) return
  for (const child of tool.tools) {
    const childName = childNameOf(child)
    if (childName !== undefined) names.add(qualifiedToolName(name, childName))
  }
}

/** Name of one namespace child, if the entry is shaped like a tool at all. */
function childNameOf(child: unknown): string | undefined {
  if (child === null || typeof child !== "object" || Array.isArray(child))
    return undefined
  const name = (child as JsonObject).name
  return typeof name === "string" && name !== "" ? name : undefined
}

/** Drops the children a previous declaration already contributed. */
function withoutDeclaredChildren(
  tool: JsonObject,
  declared: Set<string>,
): JsonObject | undefined {
  const name = typeof tool.name === "string" ? tool.name : undefined
  if (name === undefined || name === "") return tool
  if (tool.type !== "namespace") {
    if (declared.has(name)) return undefined
    declared.add(name)
    return tool
  }
  if (!Array.isArray(tool.tools)) return tool
  const children = tool.tools.filter((child) => {
    const childName = childNameOf(child)
    if (childName === undefined) return false
    const upstream = qualifiedToolName(name, childName)
    if (declared.has(upstream)) return false
    declared.add(upstream)
    return true
  })
  if (children.length === 0) return undefined
  if (children.length === tool.tools.length) return tool
  return { ...tool, tools: children }
}

function mergeAdditionalTools(
  tools: ReadonlyArray<JsonObject>,
  items: Request["input"],
): Array<JsonObject> {
  if (!Array.isArray(items)) return [...tools]
  const declared = new Set<string>()
  for (const tool of tools) collectToolNames(tool, declared)
  const merged = [...tools]
  for (const item of items) {
    if (item.type !== "additional_tools" && item.type !== "tool_search_output")
      continue
    const additional = parse(
      z.array(z.record(z.string(), z.unknown())).optional(),
      item.tools,
    )
    for (const tool of additional ?? []) {
      const keep = withoutDeclaredChildren(tool, declared)
      if (keep !== undefined) merged.push(keep)
    }
  }
  return merged
}

function toolSearchText(item: JsonObject): JsonObject {
  return { text: JSON.stringify(item) }
}

function flattenTools(tools: ReadonlyArray<JsonObject>, options?: ConversionOptions): FlattenedTools {
  const result: FlattenedTools = { declarations: [], tools: new Map() }
  for (const tool of tools) {
    if (tool.type === "web_search" || tool.type === "tool_search") {
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
  // Calls of the newest model turn, in the order the client reported them.
  // Upstream pairs the Nth response with the Nth call, so the order matters.
  pendingCalls: Array<string>
  // Tool results waiting for the rest of their call group, keyed by call id.
  answers: Map<string, JsonObject>
  // Instructions that arrived while a call was unanswered. A tool result has
  // to follow its call, so the text waits for the group to be emitted.
  heldInstruction: Array<JsonObject>
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
    (part) => !state.carrierParts.some((held) => isSamePart(held, part)),
  )
  pushPart(state, "model", fresh)
}

/**
 * A carrier holds the model turn verbatim, so it also supersedes any part the
 * client already replayed as its own item. Clients that place the reasoning
 * item after the call or message they belong to would otherwise duplicate the
 * turn, because the carrier is only decoded when its item is reached.
 */
function dropCarriedParts(
  state: ContentsState,
  parts: Array<JsonObject>,
): void {
  const last = state.contents.at(-1)
  if (last === undefined || last.role !== "model") return
  const existing = last.parts as Array<JsonObject>
  const kept = existing.filter(
    (part) => !parts.some((held) => isSamePart(held, part)),
  )
  if (kept.length === existing.length) return
  existing.length = 0
  existing.push(...kept)
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

/**
 * Emits the pending tool results once the model turn they answer is complete.
 * Upstream matches the Nth response to the Nth call, so the results are
 * written in call order even when the client reported them out of order. A
 * call without a result is never answered with an invented one.
 */
function flushAnswers(state: ContentsState, final = false): void {
  if (state.pendingCalls.length === 0) return
  const complete = state.pendingCalls.every((id) => state.answers.has(id))
  if (!complete && !final) return
  const parts = state.pendingCalls.flatMap((id) => {
    const part = state.answers.get(id)
    return part === undefined ? [] : [part]
  })
  state.pendingCalls = []
  state.answers.clear()
  pushPart(state, "user", parts)
}

/**
 * Whether the newest model turn still owes a tool result. A carrier counts
 * too: its calls are only answered once the client replays them, so an
 * instruction landing between the carrier and the replay would split the turn.
 */
function callInFlight(state: ContentsState): boolean {
  return (
    state.pendingCalls.length > 0
    || state.carrierParts.some(
      (part) => part.functionCall !== undefined && part.functionCall !== null,
    )
  )
}

/** Releases a held instruction once no call is waiting for its result. */
function releaseInstruction(state: ContentsState): void {
  if (callInFlight(state) || state.heldInstruction.length === 0) return
  pushPart(state, "user", state.heldInstruction)
  state.heldInstruction = []
}

function applyItem(state: ContentsState, item: JsonObject): void {
  // Tools added mid-conversation travel as their own input item, so the
  // caller merges the declarations and the item stays out of the history.
  if (item.type === "additional_tools") return
  if (item.type === "tool_search_call") {
    pushModelPart(state, [toolSearchText(item)])
    return
  }
  if (item.type === "tool_search_output") {
    pushPart(state, "user", [toolSearchText(item)])
    return
  }
  if (item.role === "system" || item.role === "developer") {
    const text = messageTexts(item.content).join("")
    // GenerateContent has no developer role, so an instruction that arrives
    // after the conversation started stays where it appeared, as user text,
    // unless a call is still unanswered: the result has to come first.
    if (state.contents.length > 0) {
      if (callInFlight(state)) state.heldInstruction.push({ text })
      else pushPart(state, "user", [{ text }])
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
      state.pendingCalls.push(parse(z.string().min(1), item.call_id))
      return
    }
    case "function_call_output":
    case "custom_tool_call_output": {
      const callId = parse(z.string().min(1), item.call_id)
      const part = toolResultPart(item, state.calls)
      // A result for a call that is not waiting belongs to no group the
      // upstream still tracks, so it travels on its own.
      if (state.pendingCalls.includes(callId)) {
        state.answers.set(callId, part)
        flushAnswers(state)
      } else {
        pushPart(state, "user", [part])
      }
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
      dropCarriedParts(state, parts)
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
    pendingCalls: [],
    answers: new Map(),
    heldInstruction: [],
  }
  for (const item of inputItems) {
    applyItem(state, item)
    releaseInstruction(state)
  }
  // A call the client never answered stays unanswered: the upstream accepts a
  // trailing call group, and inventing a result would change the conversation.
  flushAnswers(state, true)
  if (state.heldInstruction.length > 0) {
    pushPart(state, "user", state.heldInstruction)
    state.heldInstruction = []
  }
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
  applyTextFormat(request.text?.format, generation)
  return generation
}

/**
 * Responses `text.format` -> Gemini structured output. Plain `text` is the
 * default on both sides, so it adds nothing. The declared schema travels
 * unchanged, because it is the contract the model is held to.
 *
 * The schema is declared as `responseSchema`. This endpoint accepts that field
 * and constrains the answer with it, while `responseJsonSchema` is silently
 * ignored — a 200 with prose is worse than an error, so the ignored spelling
 * is not used.
 */
function applyTextFormat(format: unknown, generation: JsonObject): void {
  if (format === undefined) return
  const parsed = parse(
    z.object({
      type: z.string().optional(),
      // A schema is either flat on the format or nested under `json_schema`,
      // depending on which Responses revision the client speaks.
      schema: z.unknown().optional(),
      json_schema: z.object({ schema: z.unknown().optional() }).optional(),
    }),
    format,
  )
  switch (parsed.type) {
    case undefined:
    case "text": {
      return
    }
    case "json_object": {
      generation.responseMimeType = "application/json"
      return
    }
    case "json_schema": {
      const schema = parsed.schema ?? parsed.json_schema?.schema
      if (schema === undefined)
        throw new GenerateContentConversionError(
          "json_schema format requires a schema",
        )
      generation.responseMimeType = "application/json"
      generation.responseSchema = structuredClone(schema)
      return
    }
    default: {
      throw new GenerateContentConversionError(
        `Unsupported text format: ${String(parsed.type)}`,
      )
    }
  }
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
