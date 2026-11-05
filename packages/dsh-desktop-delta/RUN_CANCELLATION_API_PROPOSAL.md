# 精确取消单次运行接口提案

## 当前状态

此文定义上游接口需求，**不表示 Delta 已支持停止生成**。Delta 通过官方 `dsh --profile sdk` 启动长期运行的 stdio JSON-RPC 服务，不启动 Harness 自带 Web UI。当前 Tauri handshake 没有 `sessions.cancel`，`upstream.runCancellation=false`。

## 官方已有接口

依据 2026-11-05 核验的 DeepSeek Harness 官方 `master`：

- `packages/api/session-controller/src/index.ts` 发布 `@Remote('cancel')`，即公开 Session Controller Remote API `session.cancel`。
- `packages/api/session-controller/src/types.ts` 定义 `SessionCancelRequest { sessionId }` 和 `SessionCancelValue { accepted: true }`，没有 `turnId`、`runId`。
- `packages/api/session-controller/src/commands.ts` 查找已附着的普通 Agent，执行 `agent.cancel({ kind: 'user' }, { keepInbox: true })`。会话未附着或属于受限制的子 Agent 时拒绝，保留待处理 Inbox；`accepted` 只表示取消命令已接纳。
- 该方法属于 API Gateway 上的公开 Remote API，而不是当前桌面连接的 stdio SDK。`packages/sdk/protocol/src/types.ts` 的 `HarnessSdkRequestMap` 和 `packages/sdk/server/src/server.ts` 的方法分发均没有 `session/cancel`。

官方代码：[公开入口](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/api/session-controller/src/index.ts)、[请求类型](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/api/session-controller/src/types.ts)、[取消实现](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/api/session-controller/src/commands.ts)、[SDK 协议](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/sdk/protocol/src/types.ts)、[SDK 服务端](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/sdk/server/src/server.ts)。

## 需要的上游合同

优先在官方 SDK stdio 中增加可协商的 `session/cancel-turn`；也可以发布独立、受支持、经过鉴权的本机 API-only transport。Delta 不直接调用 Harness Context 服务、未公开模块或私有数据库。

### 请求

```ts
interface CancelTurnRequest {
  sessionId: string
  expectedTurnId: string
  requestId: string
  scope: 'active-turn'
}
```

- `sessionId` 必须是 Host 当前用户有权控制的稳定会话 ID。
- `expectedTurnId` 由 Host 提供，必须**原子核验当前活动回合身份**，不得由 Delta 本机时间或发送次数推导。
- 回合自然结束或已经切换时，应返回 `stale_turn`／已结束结果；不得误取消下一轮任务。
- `requestId` 保障重发幂等；超时或断线时不得盲目重试取消。
- `scope` 严格限制为选定活动回合，不得扩大到整个进程、其他会话或全部子 Agent。

### 接纳回执与终态

```ts
interface CancelTurnReceipt {
  sessionId: string
  turnId: string
  requestId: string
  accepted: boolean
  state: 'cancellation-requested' | 'already-settled'
}
```

- `accepted` 仅确认请求被接纳；界面显示“取消中”，不能立即提示已取消。
- Host 应发送与 `turnId` 对应的终态，区分 `cancelled`、`completed`、`failed`。取消与自然完成竞争时，展示实际终态。
- 取消不得清除会话历史、待处理 Inbox 或其他会话；已发生的工具操作、文件写入和外部进程副作用不保证回滚。
- 根 Agent 取消不意味着受管子 Agent 或后台作业已停止。`session/wait` 仍用于等待完整任务树结束。
- 至少区分 `unsupported_capability`、`permission_denied`、`not_found`、`stale_turn`、`runtime_unavailable`、`timeout`。断线、超时或缺少终态时标记 `outcomeUnknown=true`，不显示“取消成功”。

### 子 Agent 边界

现有 `session.cancel` 仅作用于活动普通 Agent，不能宣称已经取消受管子 Agent 和后台作业。若未来需要整树取消，必须另行协商 `sessions.cancel-run-tree`，定义所有权、执行中工具、取消传播和终态聚合。

## Delta 接入与验收

1. 公开传输未接通前，握手不能声明 `sessions.cancel`；前端不显示可操作的停止按钮。
2. 实现后必须对 Host 提供的活动 `turnId` 精确取消；界面在接纳后仍等真实终态。
3. 不能通过 `AbortSignal`、关闭 Harness 进程、删除本机历史、修改 Harness 私有状态模拟取消。
4. 切换会话不改变已发送取消请求的 `sessionId` 和 `expectedTurnId`。
5. 使用真实 Harness 验证目标精确性、跨会话隔离、回合切换竞态、Inbox 保留、权限拒绝、子 Agent 边界和断线后的结果未知。
