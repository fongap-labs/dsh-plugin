# Harness 会话目录接口提案

## 状态

- 本文记录 Delta 对 Harness 上游的接口需求，不代表 Delta 已实现完整会话目录。
- 当前桌面运行方式仍为官方 `sdk` profile，不启动 Harness Web Server 或原生 Web UI。
- 本提案只依赖 Harness 公开、可版本化的 Host 合同；不要求 Delta 读取 Harness 私有会话存储。

## 已核实的上游现状

核对日期：2026-11-05。核对来源为 Harness 官方仓库当前 `master`。

1. 官方 SDK stdio 协议在 packages/sdk/protocol/src/types.ts 中声明 `initialize`、`session/prompt`、`session/query`、`session/resume`、`session/wait`、工作目录读写和 `shutdown`；没有 `session/list`、`session/search` 或 `session/create`。
2. SDK 客户端的 DeepSeekHarness.`session(id?)` 只创建客户端句柄并生成或接收 session ID；运行时在首次提示或工作目录操作时才创建会话。它不能枚举已保存会话。
3. `session/resume` 只恢复调用者提供的精确持久化 session ID。缺失或不兼容时失败，不创建替代会话。
4. Harness 已公开发布 `@deepseek-ai/dsh-api-session-controller`。其 Remote namespace 通过 API Gateway 提供 session.list、session.search、session.create，并提供会话历史页和 follow 类操作。它是公开 Host API，不是 Harness 私有接口。
5. 该 Session Controller 客户端包声明为 Web 平台并依赖 API Gateway Client；当前 `sdk` profile 使用 stdio JSON-RPC，明确不启动 Web Server，没有把该 Remote transport 暴露给当前 Tauri adapter。
6. 现有 Remote session.list 返回所有可见摘要，但请求类型中的 `cursor` 当前未被列表实现使用，响应也没有下一页游标。Remote session.search 返回最多 20 条和 `hasMore`，没有下一页游标，并依赖可选的 Session Query 搜索服务。因此即使切换到该 Remote transport，也不能直接满足完整分页和稳定增量同步要求。
7. SDK 的 session.event 是实时通知；`session/resume` 保留历史日志，但不会把旧事件重新发送给客户端。断线后的事件缺口仍需要公开历史页／游标合同补齐。

官方源码与说明：

- [SDK 协议类型](https://github.com/deepseek-ai/deepseek-harness/blob/`master`/packages/sdk/protocol/src/types.ts)
- [SDK 协议说明](https://github.com/deepseek-ai/deepseek-harness/blob/`master`/packages/sdk/protocol/README.md)
- [SDK 客户端](https://github.com/deepseek-ai/deepseek-harness/blob/`master`/packages/sdk/client/src/api.ts)
- [SDK 服务端方法分发](https://github.com/deepseek-ai/deepseek-harness/blob/`master`/packages/sdk/server/src/server.ts)
- [公开 Session Controller](https://github.com/deepseek-ai/deepseek-harness/blob/`master`/packages/api/session-controller/src/index.ts)
- [Session Controller 数据合同](https://github.com/deepseek-ai/deepseek-harness/blob/`master`/packages/api/session-controller/src/types.ts)
- [SDK profile 组合](https://github.com/deepseek-ai/deepseek-harness/blob/`master`/packages/bundle/sdk-app/cordis.patch.yml)

## 上游需要提供的合同

优先在现有 SDK stdio JSON-RPC 协议中暴露这些方法。若 Harness 维护者选择 API Gateway，则需提供受支持的本机 API-only profile，并明确认证、端口绑定、生命周期和版本合同；不得启动 SPA 或原生 Web UI。

### 1. 会话列表

`session/list`

请求：

```ts
interface SessionListRequest {
  `cursor`?: string
  limit?: number
  workspaceId?: string
  includeSubagents?: boolean
}
```

响应：

```ts
interface SessionListResponse {
  items: SessionSummary[]
  nextCursor?: string
  `snapshotRevision`: string
}
```

要求：

- 返回调用者有权查看的活动及已保存会话，不激活冷会话。
- 游标不透明，绑定筛选条件和快照 `revision`。
- 稳定排序；翻页期间不得无故重复或遗漏项目。
- 摘要至少包含稳定 ``sessionId``、标题、更新时间、运行状态、是否空白、工作目录或工作区标识、活动 Agent 状态和必要的子会话来源信息。
- 敏感路径、消息内容和其他用户数据按 Host 权限策略最小化返回。

### 2. 会话搜索

`session/search`

请求：

```ts
interface SessionSearchRequest {
  query: string
  `cursor`?: string
  limit?: number
  fields?: Array<'title' | 'message' | 'workspace'>
}
```

响应：

```ts
interface SessionSearchResponse {
  items: Array<{
    ``sessionId``: string
    snippet: string
    field?: 'title' | 'message' | 'workspace'
  }>
  nextCursor?: string
  `hasMore`: boolean
}
```

要求：

- 只搜索调用者可见的会话。
- 搜索能力单独协商；索引未启用时返回明确的 `unsupported` 结果。
- 不返回完整消息正文，不通过扫描私有文件补齐搜索。
- 游标应允许继续检索，不以固定 20 条结果冒充完整搜索。

### 3. 显式创建会话

`session/create`

请求：

```ts
interface SessionCreateRequest {
  ``sessionId``?: string
  workspaceId?: string
  cwd?: string
  agentPreset?: string
}
```

响应：

```ts
interface SessionCreateResponse {
  ``sessionId``: string
  agentPreset?: string
}
```

要求：

- 创建结果返回 Harness 实际采用的稳定 session ID。
- 创建与恢复分离；恢复失败不得静默创建新会话。
- 如果允许复用空白会话，必须在返回值中明确实际采用的 session ID。
- 创建必须遵守 Host 工作区和权限策略。

### 4. 目录变更订阅

建议新增 `session/directory/follow`，以 `afterRevision` 为游标，推送：

```ts
interface SessionDirectoryChange {
  `revision`: string
  ``sessionId``: string
  operation: 'upsert' | 'remove'
  summary?: SessionSummary
}
```

要求：

- 订阅确认必须给出基线 `revision`；基线读取与订阅之间不能产生静默丢失窗口。
- 同一运行时内 `revision` 单调递增。
- 断线重连时可从 `revision` 回放；游标过期时明确要求重新获取列表快照。
- 删除事件只表示 Host 会话目录的变化，不允许客户端推断或删除本机 Delta 备份。

### 5. 单会话历史回放与实时跟随

建议新增：

- ``session/event`s`({ ``sessionId``, `afterSeq`, limit })：返回有序历史事件页、下一游标和当前 `head sequence`。
- `session/follow`({ ``sessionId``, `afterSeq` })：从明确游标开始推送实时事件。

要求：

- 事件必须包含稳定 ``sessionId``、事件 ID 和会话内单调递增序号。
- 覆盖消息、状态、工具活动、审批和用户提问的关联信息。
- 同一游标上的通知与响应顺序有明确定义。
- 重复事件可去重，乱序可排序，缺口可按公开游标补齐。
- 如果游标无法继续使用，返回明确的 `resync-required` 状态；不得伪称恢复了完整历史。

### 6. 能力与错误

建议 capability：

- sessions.list
- sessions.search
- sessions.create
- sessions.directory.follow
- sessions.events.replay

至少区分以下错误：

- `unsupported`_capability
- permission_denied
- not_found
- invalid_`cursor`
- `cursor`_expired
- migration_required
- runtime_unavailable

## Delta 接入规则

1. 上游没有通过当前运行通道暴露的能力，不得出现在 Tauri handshake capability 中。
2. 在目录 API 可用前，侧栏只显示 Delta 本机记录，并明确标注“本机记录”；不得把已知 session ID 或本机缓存推断为 Harness 全量目录。
3. 接入时先建立目录变更订阅，再读取带 snapshot `revision` 的列表，避免列表与实时事件之间出现竞态。
4. 所有消息、状态、工具、审批和提问均按稳定 session ID 关联；事件按序号去重和排序，缺口通过公开历史页补齐。
5. 恢复只使用 Host 返回的稳定 session ID；恢复失败保留原记录和错误，不自动创建替代会话。
6. 搜索不可用时显示 Host 返回的原因，不回退到读取 Harness 私有存储。
7. 本提案未实现任何目录按钮、假分页或模拟 Harness 会话。

## 验收标准

- 官方 SDK stdio 或官方 API-only profile 提供并文档化所需方法。
- capability 协商准确反映列表、搜索、创建、目录订阅和历史回放的真实支持情况。
- 使用真实 Harness 验证分页、搜索、创建、恢复、切换、事件去重、乱序和缺口补齐。
- 验证不同权限主体只能看到有权访问的会话。
- 不启动 Harness 原生 Web UI，不读取 Harness 私有会话文件、数据库或安装目录。
