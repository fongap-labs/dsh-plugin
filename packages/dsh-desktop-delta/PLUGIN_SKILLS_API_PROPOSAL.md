# Harness 插件与 Skills 桌面接口提案

## 当前情况

Harness 的 Plugin Manager 已有正式能力：读取 profile 中的组合包和插件状态，检查安装目标，安装、启用、停用、更新和移除，并提供版本兼容检查、安装进度、取消结果和重启提示。Web 插件页通过 API Gateway 调用 Plugin Manager Remote。

当前 `sdk` stdio profile 没有把这些 Plugin Manager Remote 方法接给 Delta。完整 SDK profile 另启用了 Harness 自带的 `plugin_manager` Agent 工具；它可以在普通对话里受 Harness 权限和批准规则管理插件，但没有给 Delta 页面提供结构化列表和操作结果。

Harness 的 Session Controller 通过 API Gateway 提供按会话读取用户可调用 Skills 的 `skills.list` Remote。它是目录读取接口，不是独立的 Skills 安装、启停或更新接口；SDK stdio 协议没有暴露它。Skills 可能由插件或 profile 提供，不能把每个 Skill 当成可独立安装的插件。

## Delta 当前行为

“插件与 Skills”页分别标出两类能力当前不可用于直接管理。用户仍可在对话中让 Harness Agent 操作插件；Harness 自己负责确认权限、执行官方包管理流程和报告重启要求。Delta 不自行安装 npm 包、不编辑 Harness profile 文件，也不展示未经 Harness 接口确认的插件状态。

## 所需的受支持传输

请通过 SDK stdio 暴露现有 Remote 语义，或提供不启动 Harness Web UI 且具备明确本机访问边界的 API-only profile。

### 插件

1. 提供 profile 范围的插件和组合包清单，包含来源、安装状态、启用状态、兼容性和错误诊断。
2. 在执行前检查 registry、Git、tarball 或本机目标的名称、版本、DSH 兼容性和构建脚本风险，并将检查结果返回给用户确认。
3. 将安装、启停、升级和移除请求委托给 Harness Plugin Manager；禁止 Delta 自己调用 pnpm 或改写 profile。
4. 每个有副作用的操作须由 Harness 权限策略批准，回执至少包含 requestId、阶段、进度、完成状态、restart-required 和可识别错误。
5. 支持按 requestId 取消安装、恢复断线后的操作结果，并通过事件通知其他窗口的 profile 变化。
6. 内置组合包、管理器自身、正在运行的进程和启动失败都需要按 Plugin Manager 的现有规则返回明确结果。

### Skills

1. 按 sessionId 列出该 Session composition 中可调用的 Skills，不得为列目录而隐式启动一个冷 Agent。
2. 返回稳定 ID、标题、简述、来源插件或 profile、可用状态和受限的展示信息；不暴露 Harness 私有文件路径。
3. 明确 Skill 的调用方式和权限边界。若没有正式的独立 Skill 安装生命周期，就不能由 Delta 创建另一套安装、启停或删除机制。
4. 通过会话或 profile 变更事件通知目录失效；支持断线重连后重新读取。
5. 分别公布 `plugins.list`、`plugins.manage`、`skills.list` 等 capability。缺少能力时，客户端应显示不可用状态，不得保留可点击的空操作。

## Harness 参考文档

- [Plugin Manager](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/boot/plugin-manager/README.md)：官方包管理、兼容性、权限、取消和进程重启语义。
- [Web Plugin Manager Client](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-plugin-manager/src/client/index.ts)：页面通过 `pluginManager` Remote 与 API Gateway 访问。
- [SDK stdio profile](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/bundle/sdk-app/README.md) 和 [SDK profile dependencies](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/bundle/sdk-app/package.json)：当前 SDK 组合没有挂载 Plugin Manager Remote。
- [Session Controller](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/api/session-controller/README.zh.md)：通过 API Gateway 提供按 Session 的 Skills 目录 Remote。
- [SDK protocol](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/sdk/protocol/README.md)：SDK stdio 的请求、通知及能力边界。
