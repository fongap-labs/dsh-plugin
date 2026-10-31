/**
 * Defensive `defineTool` wrapper and schema validation.
 *
 * The DSH host provides the authoritative `defineTool` through
 * `@deepseek-ai/dsh-tools`. Plugins also run where that package is absent (unit
 * tests, CI, scaffold previews), so this module falls back to an equivalent
 * local implementation: a single failed import must not disable a whole plugin.
 * Both paths produce a definition that `ctx.tools.register()` accepts.
 *
 * The parameter and output declarations are the official
 * `ParameterSchemaSpec` / `ValueSchemaSpec` shape, so authoring a tool against
 * this module is checked against the same contract the host enforces.
 */

import type {
  DefineToolOptions,
  InferArgs,
  InferValue,
  JsonSchemaNode,
  ParameterJsonSchema,
  ParameterPropertySpec,
  ParameterSchemaSpec,
  ToolDefinition,
  ToolRunContext,
  ValueSchemaSpec,
} from '@deepseek-ai/dsh-tools'

export type {
  DefineToolOptions,
  InferArgs,
  InferValue,
  ParameterJsonSchema,
  ParameterSchemaSpec,
  ValueSchemaSpec,
} from '@deepseek-ai/dsh-tools'

/** Module id of the host package that owns the authoritative `defineTool`. */
const HOST_TOOLS_MODULE = '@deepseek-ai/dsh-tools'

/**
 * Erased signature of the host's `defineTool`. The host implementation is
 * generic; loading it through a dynamic import erases the type parameters, so
 * the widest valid instantiation is used as the boundary.
 */
type HostDefineTool = (options: DefineToolOptions<ParameterSchemaSpec, ValueSchemaSpec>) => ToolDefinition

/** Raised when a tool definition or schema violates the registry contract. */
export class ToolDefinitionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ToolDefinitionError'
  }
}

/** Raised when model-supplied arguments fail the declared parameter schema. */
export class ToolArgsError extends Error {
  /** Individual violations in schema-walk order. */
  readonly violations: string[]

  constructor(violations: readonly string[] | string) {
    const list = Array.isArray(violations) ? [...violations] : [String(violations)]
    super(`invalid arguments: ${list.join('; ')}`)
    this.name = 'ToolArgsError'
    this.violations = list
  }
}

/** Minimal logger surface used for degraded-path warnings. */
export interface LoggerLike {
  warn?: (message: string) => void
}

/** Result of a registrable tool registry, as far as this module relies on it. */
export interface ToolRegistryLike {
  register(definition: ToolDefinition): (() => void) | undefined
}

/** Context surface `registerTool` consumes. */
export interface ToolRegistrationContext {
  tools?: ToolRegistryLike | null
  logger?: LoggerLike | null
}

/** Outcome of {@link registerTool}. */
export interface RegisterToolResult {
  registered: boolean
  disposer?: (() => void) | undefined
  error?: ToolDefinitionError | undefined
}

/** Which `defineTool` implementation is currently active. */
export type ToolDefinitionSource = 'host' | 'fallback'

/** Outcome of {@link primeHostTools}. */
export interface PrimeHostToolsResult {
  defineTool: HostDefineTool | null
  source: ToolDefinitionSource
}

let hostDefineTool: HostDefineTool | null = null
let hostModulePromise: Promise<PrimeHostToolsResult> | null = null

/**
 * Try to load the host's `defineTool`. Idempotent and safe to call repeatedly.
 */
export function primeHostTools(): Promise<PrimeHostToolsResult> {
  if (!hostModulePromise) {
    hostModulePromise = import(HOST_TOOLS_MODULE)
      .then((mod: { defineTool?: unknown }): PrimeHostToolsResult => {
        if (typeof mod.defineTool !== 'function') {
          throw new Error('host module does not export defineTool')
        }
        hostDefineTool = mod.defineTool as HostDefineTool
        return { defineTool: hostDefineTool, source: 'host' }
      })
      .catch((): PrimeHostToolsResult => ({ defineTool: null, source: 'fallback' }))
  }
  return hostModulePromise
}

/**
 * The `defineTool` implementation currently in effect.
 */
export function toolDefinitionSource(): ToolDefinitionSource {
  return hostDefineTool ? 'host' : 'fallback'
}

/**
 * Compile an author-facing parameter map into the DSH JSON Schema object root.
 *
 * Input: `{ path: { type: 'string', required: true, description: '...' } }`
 * Output: `{ type: 'object', properties: { path: { type: 'string', description: '...' } }, required: ['path'] }`
 */
export function compileParameterSchema(spec: ParameterSchemaSpec): ParameterJsonSchema {
  if (spec === null || typeof spec !== 'object' || Array.isArray(spec)) {
    throw new ToolDefinitionError('parameters must be a property-map object')
  }
  const properties: Record<string, JsonSchemaNode> = {}
  const required: string[] = []
  for (const [key, node] of Object.entries<ParameterPropertySpec>(spec)) {
    const child = compileSchemaNode(node, `parameters.${key}`)
    if (node && typeof node === 'object' && node.required === true) required.push(key)
    properties[key] = child
  }
  const schema: ParameterJsonSchema = { type: 'object', properties }
  if (required.length > 0) schema.required = required
  return schema
}

/**
 * Compile an author-facing value schema into the DSH JSON Schema subset.
 * The root node carries no `required` marker; `required: true` on properties is
 * aggregated into a `required` array on their parent.
 */
export function compileValueSchema(spec: ValueSchemaSpec): JsonSchemaNode {
  if (spec === null || typeof spec !== 'object' || Array.isArray(spec)) {
    throw new ToolDefinitionError('output.schema must be a schema object')
  }
  const node = compileSchemaNode(spec, 'schema')
  // Output-root requiredness is not enforced: the fallback validates arguments,
  // never the returned value, and the published shape has always omitted it.
  // Nested object levels keep their aggregated `required` array.
  delete node.required
  return node
}

/** Author-facing node fields that are consumed during compilation. */
interface AuthorSchemaNode {
  properties?: ParameterSchemaSpec
  items?: ValueSchemaSpec
  required?: boolean
  [key: string]: unknown
}

/**
 * Compile one author-facing schema node. The author-only `required: true`
 * marker is never copied: parents aggregate it into a `required` array.
 */
function compileSchemaNode(input: ValueSchemaSpec | ParameterPropertySpec, path: string): JsonSchemaNode {
  if (typeof input === 'string') return { type: input as JsonSchemaNode['type'] }
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new ToolDefinitionError(`${path} must be a schema object or type string`)
  }
  const { properties, items, required: _required, ...rest } = input as unknown as AuthorSchemaNode
  const node = { ...rest } as JsonSchemaNode
  if (properties !== undefined) {
    const compiled: Record<string, JsonSchemaNode> = {}
    const childRequired: string[] = []
    for (const [key, value] of Object.entries<ParameterPropertySpec>(properties)) {
      compiled[key] = compileSchemaNode(value, `${path}.properties.${key}`)
      if (value && typeof value === 'object' && value.required === true) childRequired.push(key)
    }
    node.properties = compiled
    if (childRequired.length > 0) node.required = childRequired
  }
  if (items !== undefined) node.items = compileSchemaNode(items, `${path}.items`)
  return node
}

type TypeCheck = (value: unknown) => boolean

const TYPE_CHECKS: Record<string, TypeCheck> = {
  string: (v) => typeof v === 'string',
  number: (v) => typeof v === 'number' && Number.isFinite(v),
  integer: (v) => typeof v === 'number' && Number.isInteger(v),
  boolean: (v) => typeof v === 'boolean',
  null: (v) => v === null,
  array: (v) => Array.isArray(v),
  object: (v) => typeof v === 'object' && v !== null && !Array.isArray(v),
}

/**
 * Validate a value against a compiled schema.
 * @returns Violation paths; an empty array means the value is valid.
 */
export function validateAgainstSchema(schema: JsonSchemaNode, value: unknown, path: string): string[] {
  const violations: string[] = []
  walk(schema, value, path, violations)
  return violations
}

function walk(schema: JsonSchemaNode, value: unknown, path: string, violations: string[]): void {
  if (schema === null || typeof schema !== 'object') return
  const types: string[] = Array.isArray(schema.type) ? [...schema.type] : [schema.type as string]
  const matches = (type: string): boolean => {
    const check = TYPE_CHECKS[type]
    return typeof check === 'function' ? check(value) : true
  }
  if (types.length > 0 && types.every((type) => type === undefined || !matches(type))) {
    violations.push(`"${path}" must be of type ${types.join('|')}`)
    return
  }
  if (Array.isArray(schema.enum) && !schema.enum.includes(value as never)) {
    violations.push(`"${path}" must be one of ${JSON.stringify(schema.enum)}`)
  }
  if (schema.type === 'object' && value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>
    const required = Array.isArray(schema.required) ? schema.required : []
    for (const name of required) {
      if (!Object.hasOwn(record, name) || record[name] === undefined) {
        violations.push(`"${path}.${name}" is required`)
      }
    }
    const props = schema.properties ?? {}
    for (const [key, child] of Object.entries(props)) {
      if (Object.hasOwn(record, key)) walk(child, record[key], `${path}.${key}`, violations)
    }
  }
  if (schema.type === 'array' && Array.isArray(value)) {
    const items = schema.items ?? {}
    for (let i = 0; i < value.length; i += 1) walk(items, value[i], `${path}[${i}]`, violations)
  }
}

/**
 * Assert that a definition meets the minimum shape `ctx.tools.register()`
 * requires.
 */
export function assertToolDefinition(definition: ToolDefinition): ToolDefinition {
  if (!definition || typeof definition !== 'object') {
    throw new ToolDefinitionError('tool definition must be an object')
  }
  const candidate = definition as ToolDefinition & {
    parameters?: unknown
    output?: { schema?: unknown; render?: unknown }
    execute?: unknown
  }
  if (typeof candidate.name !== 'string' || candidate.name.trim() === '') {
    throw new ToolDefinitionError('tool.name must be a non-empty string')
  }
  if (typeof candidate.description !== 'string' || candidate.description.trim() === '') {
    throw new ToolDefinitionError('tool.description must be a non-empty string')
  }
  if (!candidate.parameters || typeof candidate.parameters !== 'object' || Array.isArray(candidate.parameters)) {
    throw new ToolDefinitionError('tool.parameters must be a JSON Schema object')
  }
  if (!candidate.output || typeof candidate.output !== 'object') {
    throw new ToolDefinitionError('tool.output must be an object')
  }
  if (!candidate.output.schema || typeof candidate.output.schema !== 'object') {
    throw new ToolDefinitionError('tool.output.schema must be an object')
  }
  if (typeof candidate.output.render !== 'function') {
    throw new ToolDefinitionError('tool.output.render must be a function')
  }
  if (typeof candidate.execute !== 'function') {
    throw new ToolDefinitionError('tool.execute must be a function')
  }
  return definition
}

/**
 * Register a tool on `ctx.tools`. A missing registry degrades to a warning
 * instead of throwing, so a plugin stays inert in a profile that mounts no
 * tools service.
 */
export function registerTool(
  ctx: ToolRegistrationContext | null | undefined,
  definition: ToolDefinition,
): RegisterToolResult {
  assertToolDefinition(definition)
  const registry = ctx?.tools
  if (!registry || typeof registry.register !== 'function') {
    const error = new ToolDefinitionError('tools service unavailable: ctx.tools.register is not a function')
    ctx?.logger?.warn?.(`registerTool: ${error.message}`)
    return { registered: false, error }
  }
  const disposer = registry.register(definition)
  return { registered: true, disposer }
}

/**
 * Define a tool. The host implementation is used when it has been primed;
 * otherwise the local equivalent takes over.
 */
export function defineTool<const S extends ParameterSchemaSpec, const O extends ValueSchemaSpec>(
  options: DefineToolOptions<S, O>,
): ToolDefinition {
  // The public signature carries the parameter/output generics so call sites get
  // inferred arguments and values. The implementation boundary is erased: the
  // host implementation is loaded through a dynamic import (generics erased),
  // and the fallback is a schema compiler that only needs the erased domain.
  const erased = options as unknown as ErasedToolOptions
  const host = hostDefineTool
  if (host) return host(erased)
  return fallbackDefineTool<S, O>(options)
}

/** Fully erased tool options: the domain every implementation accepts. */
type ErasedToolOptions = DefineToolOptions<ParameterSchemaSpec, ValueSchemaSpec>


/**
 * Local `defineTool` equivalent: compile the author-facing schemas, validate
 * arguments on every call, and return a registry-ready definition.
 */
function fallbackDefineTool<const S extends ParameterSchemaSpec, const O extends ValueSchemaSpec>(
  options: DefineToolOptions<S, O>,
): ToolDefinition {
  if (!options || typeof options !== 'object') {
    throw new ToolDefinitionError('defineTool: options must be an object')
  }
  const { name, description, parameters, output, execute } = options
  if (typeof name !== 'string' || name.trim() === '') {
    throw new ToolDefinitionError('defineTool: name is required')
  }
  if (typeof description !== 'string' || description.trim() === '') {
    throw new ToolDefinitionError('defineTool: description is required')
  }
  if (typeof execute !== 'function') {
    throw new ToolDefinitionError('defineTool: execute must be a function')
  }
  if (!output || typeof output !== 'object') {
    throw new ToolDefinitionError('defineTool: output must be an object')
  }
  if (typeof output.render !== 'function') {
    throw new ToolDefinitionError('defineTool: output.render must be a function')
  }
  const compiledParameters = compileParameterSchema(parameters ?? ({} as S))
  const compiledOutputSchema = compileValueSchema(output.schema ?? ({ type: 'string' } as unknown as O))
  const validate = (args: unknown): string[] => validateAgainstSchema(compiledParameters, args, 'arguments')
  // Registry-boundary erasure: a registry-ready definition is consumed with
  // `unknown` arguments and a lossless-JSON value, while the author-facing
  // callbacks are typed by the schema generics. The two views are re-bound here,
  // once, instead of at every call. `invoke` only runs after `validate` accepted
  // the arguments against the very schema those generics describe, and the value
  // it renders is the value this definition itself produced.
  const render = output.render as unknown as ToolDefinition['output']['render']
  const invoke = execute as unknown as ToolDefinition['execute']
  const tool: ToolDefinition = {
    name,
    description,
    // `ToolSchema.parameters` is a raw JSON Schema bag; the compiled parameter
    // root is exactly that shape, only typed through the stricter projection.
    parameters: compiledParameters as unknown as Record<string, unknown>,
    output: { schema: compiledOutputSchema, render },
    async execute(args, exec: ToolRunContext) {
      const violations = validate(args)
      if (violations.length > 0) throw new ToolArgsError(violations)
      return invoke(args as InferArgs<S>, exec)
    },
  }
  if (options.timeoutMs !== undefined && (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0)) {
    throw new ToolDefinitionError(`defineTool(${name}): timeoutMs must be a positive finite number`)
  }
  if (options.timeoutMs !== undefined) tool.timeoutMs = options.timeoutMs
  if (options.deferLoading === true) tool.deferLoading = true
  return tool
}
