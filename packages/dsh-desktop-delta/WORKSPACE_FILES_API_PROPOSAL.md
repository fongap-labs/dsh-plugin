# 工作区与文件接口提案

## 状态

本文定义 Delta Desktop 的上游公开合同，不表示正式工作区列表、文件树或写入已实现。Delta 使用 Tauri 2 与官方 `dsh --profile sdk`，Harness 是唯一运行内核；不启动 Harness Web UI，也不读取 Harness 私有会话、设置、数据库或安装目录。

## 上游已有接口

核对日期：2026-11-05，来源为 Harness 官方仓库 `master`。

- SDK stdio 支持 `session/working-directory/get` 和 `session/working-directory/set`，均返回 `{ cwd }`。`cwd` 是会话工作目录，不等于持久 Workspace registry。SDK 对未知 `sessionId` 的目录请求可能懒创建会话，因此 Delta 只能在提示成功、恢复成功或设置目录成功后读取。
- `@deepseek-ai/dsh-api-workspace-controller` 通过 API Gateway Remote namespace `workspace` 提供 `create`、`rename`、`delete`、排序、归档／置顶及 `follow`。`follow` 先推送完整基线，再推送增量；重连以新基线替代旧状态，没有持久回放游标。
- `@deepseek-ai/dsh-api-workspace-files` 的 Remote namespace `workspaceFiles` 提供 `stat`、`read`、`readBytes`、`list`、`changes`，是只读文件预览服务，没有文件写入。
- `workspaceFiles.list` 与目录监视限定在会话工作区范围内；`read`、`readBytes`、`stat` 的授权由组合文件系统决定，可能允许读取工作区之外的文件。Delta 不应隐式继承这一较宽权限。
- 上述两个 Remote namespace 当前未通过 `sdk` stdio profile 暴露，不允许访问内部 Context 对象或读取私有存储绕过这一限制。

官方资料：

- [SDK 协议](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/sdk/protocol/README.md)
- [SDK 服务端](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/sdk/server/src/server.ts)
- [Workspace Controller](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/api/workspace-controller/README.md)
- [Workspace Controller 公开方法](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/api/workspace-controller/src/index.ts)
- [Workspace Files](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/api/workspace-files/README.md)
- [Workspace Files 公开方法](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/api/workspace-files/src/index.ts)

## 上游传输合同

优先在官方 SDK stdio 中暴露 Workspace 和文件服务；也可以提供独立、鉴权明确、生命周期受控且不启动 SPA 的本机 API-only profile。必须明确版本、权限、错误和取消语义。

### 工作区目录

```ts
interface WorkspaceSnapshot {
  revision?: string
  items: Array<{
    workspaceId: string
    title: string
    path: string
    sessionIds: string[]
  }>
  order: string[]
}
```

- 目录必须由 Harness 返回，不得根据 `cwd` 或 Delta 本机缓存合成。
- 创建、重命名、删除注册、排序与会话关联由 Host 鉴权；移除 Workspace 注册不删除物理文件或 Session。
- 遵守现有 `workspace.follow` 的完整基线加增量语义；重连后替换基线，不假装存在当前未提供的历史游标。
- 若未来新增持久 `revision`，需定义原子快照、事件顺序、重复、游标过期和重同步。
- 建议能力：`workspace.list`、`workspace.select`、`workspace.follow`、`workspace.manage`，不能根据 `workspace.cwd` 推断。

### 文件树与文本预览

```ts
interface WorkspaceFileListRequest {
  sessionId: string
  workspaceId: string
  relativePath: string
}
interface WorkspaceFileReadRequest {
  sessionId: string
  workspaceId: string
  relativePath: string
  offset: number
  limit: number
  expectedVersion?: string
}
```

- Host 验证 `sessionId`、`workspaceId` 和调用者权限；仅接受工作区根目录相对路径。
- 必须检查 `..`、跨盘符、symlink、Windows junction、大小写差异与 TOCTOU，禁止逃逸到未授权目录。
- 列表保留 `entries` 和 `truncated`；截断不能冒充支持分页。
- 文本预览保留行数上限、UTF-8 校验、`version` 和 `eof`；二进制读取仅允许明确授权的有界窗口。
- 变更观察应等待 `ready` 后读取初始内容；断线后重新订阅并校验版本，不假设收到所有通知。
- 当前 Remote 文件读取可能超出工作区，Delta 必须缩减默认权限；其他读取须有 Harness 提供的用途受限授权。
- 建议能力 `workspace.files.list`、`workspace.files.read`、`workspace.files.watch`；传输未接通前不得声明。

### 文件修改

当前 `workspaceFiles` 只读。写入、重命名和删除应由 Harness 另行发布权限受控的 Host API，要求审批、路径校验、`expectedVersion`、大小上限、并发冲突和审计回执。Delta 不使用 Rust 文件操作绕过 Harness。

## 验收

至少区分 `unsupported_capability`、`permission_denied`、`workspace/not-found`、`workspace-file/not-found`、`workspace-file/outside-workspace`、`workspace-file/not-text`、`workspace-file/too-large`、`conflict`、`runtime_unavailable`、`timeout`。

使用真实 Harness 验证冷会话、活动会话、权限隔离、目录穿越、链接越界、超大文件、无效 UTF-8、目录变更竞态和断线重连。在接口正式开放前不显示虚构文件树或写入操作。
