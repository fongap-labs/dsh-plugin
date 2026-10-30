/**
 * defineTool 容错封装与 Schema 校验。
 *
 * DSH 宿主通过 @deepseek-ai/dsh-tools 提供权威的 defineTool；插件运行在缺少该宿主
 * 依赖的环境（单元测试、CI、脚手架预览）时，本模块退回到等价的本地实现，确保一次
 * import 失败不会让整个插件不可用。两种实现产出的 definition 都可直接被
 * ctx.tools.register() 接收。
 */

const HOST_TOOLS_MODULE = "@deepseek-ai/dsh-tools";

export class ToolDefinitionError extends Error {
  constructor(message) {
    super(message);
    this.name = "ToolDefinitionError";
  }
}

export class ToolArgsError extends Error {
  constructor(violations) {
    super(`invalid arguments: ${Array.isArray(violations) ? violations.join("; ") : String(violations)}`);
    this.name = "ToolArgsError";
    this.violations = Array.isArray(violations) ? violations : [String(violations)];
  }
}

let hostDefineTool = null;
let hostModulePromise = null;

/**
 * 尝试加载宿主的 defineTool。幂等、可重复调用。
 * @returns {Promise<{ defineTool: Function|null, source: "host"|"fallback" }>}
 */
export function primeHostTools() {
  if (!hostModulePromise) {
    hostModulePromise = import(HOST_TOOLS_MODULE)
      .then((mod) => {
        if (typeof mod?.defineTool !== "function") {
          throw new Error("host module does not export defineTool");
        }
        hostDefineTool = mod.defineTool;
        return { defineTool: mod.defineTool, source: "host" };
      })
      .catch(() => ({ defineTool: null, source: "fallback" }));
  }
  return hostModulePromise;
}

/**
 * 当前生效的 defineTool 来源：`host` 表示已加载宿主实现，否则 `fallback`。
 */
export function toolDefinitionSource() {
  return hostDefineTool ? "host" : "fallback";
}

/**
 * 把作者友好的属性映射编译为 DSH 约定的 JSON Schema 对象根。
 *
 * 入参形式：{ path: { type: "string", required: true, description: "..." } }
 * 产出形式：{ type: "object", properties: { path: { type: "string", description: "..." } }, required: ["path"] }
 */
export function compileParameterSchema(spec) {
  if (spec === null || typeof spec !== "object" || Array.isArray(spec)) {
    throw new ToolDefinitionError("parameters must be a property-map object");
  }
  const properties = {};
  const required = [];
  for (const [key, node] of Object.entries(spec)) {
    const child = compileSchemaNode(node, `parameters.${key}`);
    if (node && typeof node === "object" && node.required === true) required.push(key);
    properties[key] = child;
  }
  const schema = { type: "object", properties };
  if (required.length > 0) schema.required = required;
  return schema;
}

/**
 * 把作者友好的值 schema 编译为 DSH 约定的 JSON Schema 子集。
 * 根节点不接受 required 标记；properties 上的 required: true 会聚合成 required 数组。
 */
export function compileValueSchema(spec) {
  if (spec === null || typeof spec !== "object" || Array.isArray(spec)) {
    throw new ToolDefinitionError("output.schema must be a schema object");
  }
  const node = compileSchemaNode(spec, "schema");
  delete node.required;
  return node;
}

function compileSchemaNode(input, path) {
  if (typeof input === "string") return { type: input };
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new ToolDefinitionError(`${path} must be a schema object or type string`);
  }
  const { properties, items, required, ...rest } = input;
  const node = { ...rest };
  if (properties !== undefined) {
    const compiled = {};
    const childRequired = [];
    for (const [key, value] of Object.entries(properties)) {
      const child = compileSchemaNode(value, `${path}.properties.${key}`);
      if (value && typeof value === "object" && value.required === true) childRequired.push(key);
      delete child.required;
      compiled[key] = child;
    }
    node.properties = compiled;
    if (childRequired.length > 0) node.required = childRequired;
  }
  if (items !== undefined) node.items = compileSchemaNode(items, `${path}.items`);
  return node;
}

const TYPE_CHECKS = {
  string: (v) => typeof v === "string",
  number: (v) => typeof v === "number" && Number.isFinite(v),
  integer: (v) => typeof v === "number" && Number.isInteger(v),
  boolean: (v) => typeof v === "boolean",
  null: (v) => v === null,
  array: (v) => Array.isArray(v),
  object: (v) => typeof v === "object" && v !== null && !Array.isArray(v),
};

/**
 * 校验一个值是否符合 schema，返回违规路径数组（空数组表示通过）。
 */
export function validateAgainstSchema(schema, value, path) {
  const violations = [];
  walk(schema, value, path, violations);
  return violations;
}

function walk(schema, value, path, violations) {
  if (schema === null || typeof schema !== "object") return;
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  const matches = (t) => {
    const check = TYPE_CHECKS[t];
    return typeof check === "function" ? check(value) : true;
  };
  if (types.length > 0 && types.every((t) => t === undefined || !matches(t))) {
    violations.push(`"${path}" must be of type ${types.join("|")}`);
    return;
  }
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    violations.push(`"${path}" must be one of ${JSON.stringify(schema.enum)}`);
  }
  if (schema.type === "object" && value && typeof value === "object" && !Array.isArray(value)) {
    const required = Array.isArray(schema.required) ? schema.required : [];
    for (const name of required) {
      if (!Object.hasOwn(value, name) || value[name] === undefined) {
        violations.push(`"${path}.${name}" is required`);
      }
    }
    const props = schema.properties ?? {};
    for (const [key, child] of Object.entries(props)) {
      if (Object.hasOwn(value, key)) walk(child, value[key], `${path}.${key}`, violations);
    }
  }
  if (schema.type === "array" && Array.isArray(value)) {
    const items = schema.items ?? {};
    for (let i = 0; i < value.length; i += 1) walk(items, value[i], `${path}[${i}]`, violations);
  }
}

/**
 * 断言一个 definition 满足 ctx.tools.register() 的最小结构要求。
 */
export function assertToolDefinition(definition) {
  if (!definition || typeof definition !== "object") {
    throw new ToolDefinitionError("tool definition must be an object");
  }
  if (typeof definition.name !== "string" || definition.name.trim() === "") {
    throw new ToolDefinitionError("tool.name must be a non-empty string");
  }
  if (typeof definition.description !== "string" || definition.description.trim() === "") {
    throw new ToolDefinitionError("tool.description must be a non-empty string");
  }
  if (!definition.parameters || typeof definition.parameters !== "object" || Array.isArray(definition.parameters)) {
    throw new ToolDefinitionError("tool.parameters must be a JSON Schema object");
  }
  if (!definition.output || typeof definition.output !== "object") {
    throw new ToolDefinitionError("tool.output must be an object");
  }
  if (!definition.output.schema || typeof definition.output.schema !== "object") {
    throw new ToolDefinitionError("tool.output.schema must be an object");
  }
  if (typeof definition.output.render !== "function") {
    throw new ToolDefinitionError("tool.output.render must be a function");
  }
  if (typeof definition.execute !== "function") {
    throw new ToolDefinitionError("tool.execute must be a function");
  }
  return definition;
}

/**
 * 安全注册一个工具到 ctx.tools。ctx.tools 缺失时降级为 warn 而非抛错，
 * 便于插件在未挂载 tools 服务的 profile 中静默跳过。
 * @returns {{ registered: boolean, disposer?: *, error?: Error }}
 */
export function registerTool(ctx, definition) {
  assertToolDefinition(definition);
  const registry = ctx?.tools;
  if (!registry || typeof registry.register !== "function") {
    const error = new ToolDefinitionError("tools service unavailable: ctx.tools.register is not a function");
    ctx?.logger?.warn?.(`registerTool: ${error.message}`);
    return { registered: false, error };
  }
  const disposer = registry.register(definition);
  return { registered: true, disposer };
}

/**
 * 定义一个工具。优先复用宿主 defineTool；未 prime 或加载失败时使用本地等价实现。
 */
export function defineTool(options) {
  if (hostDefineTool) return hostDefineTool(options);
  return fallbackDefineTool(options);
}

function fallbackDefineTool(options) {
  if (!options || typeof options !== "object") {
    throw new ToolDefinitionError("defineTool: options must be an object");
  }
  const { name, description, parameters, output, execute } = options;
  if (typeof name !== "string" || name.trim() === "") {
    throw new ToolDefinitionError("defineTool: name is required");
  }
  if (typeof description !== "string" || description.trim() === "") {
    throw new ToolDefinitionError("defineTool: description is required");
  }
  if (typeof execute !== "function") {
    throw new ToolDefinitionError("defineTool: execute must be a function");
  }
  if (!output || typeof output !== "object") {
    throw new ToolDefinitionError("defineTool: output must be an object");
  }
  if (typeof output.render !== "function") {
    throw new ToolDefinitionError("defineTool: output.render must be a function");
  }
  const compiledParameters = compileParameterSchema(parameters ?? {});
  const compiledOutputSchema = compileValueSchema(output.schema ?? { type: "string" });
  const validate = (args) => validateAgainstSchema(compiledParameters, args, "arguments");
  const tool = {
    name,
    description,
    parameters: compiledParameters,
    output: {
      schema: compiledOutputSchema,
      render(args, value) {
        return output.render(args, value);
      },
    },
    async execute(args, exec) {
      const violations = validate(args);
      if (violations.length > 0) throw new ToolArgsError(violations);
      return execute(args, exec);
    },
  };
  if (options.timeoutMs !== undefined && (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0)) {
    throw new ToolDefinitionError(`defineTool(${name}): timeoutMs must be a positive finite number`);
  }
  if (options.timeoutMs !== undefined) tool.timeoutMs = options.timeoutMs;
  if (options.deferLoading === true) tool.deferLoading = true;
  return tool;
}
