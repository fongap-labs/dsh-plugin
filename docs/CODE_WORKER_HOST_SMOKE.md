# Delta Code Worker · 真实 DSH 宿主验收

> 适用对象：`packages/dsh-delta-code` 当前 `main`。每次验收必须记录实际插件 HEAD SHA 与 DSH 发行版本；本清单是**待执行的真实宿主验收步骤**，不是已通过的测试报告。

## 环境与前置条件

1. 在实际安装的 DeepSeek Harness 创建一个**隔离 Profile**，使用一次性的 Git 工作区和无敏感数据的文件。
2. 记录本机 DSH 发行版本、平台（Windows/Linux/macOS）、Node 版本、插件 commit SHA 和 Profile 名称。实际使用的 DSH 版本必须与日志一致。
3. 在本仓库运行 `pnpm install --frozen-lockfile && pnpm build`，随后以 DSH 官方插件管理通道安装：

   ```sh
   dsh plugin --profile <已存在的隔离Profile> add link:/absolute/path/to/packages/dsh-delta-code
   ```

   注：替换路径与 Profile；不得向真实工作区安装未经验证的测试版。
4. 在真实 DSH 对话中首先调用 `code_host_probe`。记录全部布尔值。若 `fsAccessible` / `fsResolve` / `fsReadText` / `fsWriteText` 任一为 `false`，**标记阻断**，不得将本地 Node 回退当作宿主权限通过的证据。
5. `code_host_probe` 只检查接口存在，不调用方法；`writeContract: unverified` 是固定输出，绝非协议兼容性的判断。

## 自动化真实 Host 启动预检（不等于完成 H01–H10）

本仓库提供 `scripts/code-worker-host-preflight.mjs`，可在**已实际安装 DSH 的机器**上运行。它使用临时 `DSH_HOME`、隔离工作区和官方完整 `sdk` Profile（默认），不触碰已有 Profile；启动后会自动清理临时目录。可显式传入 `--profile sdk-minimal` 仅检查精简宿主的启动兼容性。先在插件仓库执行 `pnpm install --frozen-lockfile && pnpm build`，再运行：

```sh
node scripts/code-worker-host-preflight.mjs \
  --dsh /absolute/path/to/dsh-cli/bin.js \
  --plugin-dir /absolute/path/to/dsh-plugin/packages/dsh-delta-code \
  --profile sdk
```

若 `dsh` 已作为原生命令在 PATH 中，`--dsh` 和 `--profile sdk` 均可省略。`sdk` 包含完整 Base/Skills 相关服务，更适合后续 H01–H10；`sdk-minimal` 虽含 `tools` 和 `subprocess`，但有意省略 Skills 等完整服务，不能用它覆盖完整功能验收。Windows 的 npm `.cmd` shim 若无法由 Node 直接启动，应传入真正的 `bin.js` 路径，脚本会通过当前 Node 执行。上游 DSH 源码当前要求 Node.js 24.9+；应根据所安装的 DSH 版本确定运行时，不能拿插件构建使用的 Node 22 作为宿主兼容证明。

脚本逐项检查官方 CLI 版本、隔离 Profile 初始化、官方 `dsh plugin add link:...` 安装、最终配置包含本插件，以及无模型交互时原生 `sdk-minimal` 进程在观察窗口内仍运行。它不调用模型、不尝试宿主文件写入、不使用真实 GitHub 凭据。子进程只继承运行所需的少量环境变量，**不转发 API Token 或模型密钥**，输出限定为 Profile、版本、状态和阶段，不回显完整 DSH 配置、命令输出或文件内容。

`status: preflight-pass` 只说明这些准备步骤通过，`nativeProfileProcessObserved` 只说明进程保持运行，**不证明工具真正注册、可调用或通过了 Host 权限审批**。`h01Complete` 和 `h02ToH10Complete` 始终为 `false`。预检结束后临时 `DSH_HOME` 会自动清理；**不能在已清理的临时 Profile 中继续验收**。请在另行创建的隔离 `DSH_HOME` 与完整 `sdk`（或实际桌面）Profile 内执行 H01–H13，提交脱敏证据。若没有安装可调用的真实 DSH，本阶段仍标记阻断；仅运行仓库内 mock CLI 单测不能冒充真实宿主验收。

## 验收矩阵

| 序号 | 真实宿主操作 | 验收证据 |
| --- | --- | --- |
| H01 | 加载插件、打开会话并执行 `code_host_probe` | 工具可调用、注册成功、记录服务能力；不包含 Token/绝对私有路径 |
| H02 | 激活 `code-workflow` 或 `code-fast-change` Skill | 实际 Skills 注册和激活记录；无额外运行时 |
| H03 | 对工作区内测试文件调用 `code_multi_edit`，`dryRun: true` | 预演返回符合预期，目标文件内容保持不变 |
| H04 | 在 Host 明确允许的环境中执行一次 `code_multi_edit` 写入与读取 | 写入内容与读回相同，验证 Host `writeText` 实际协议；不是只看 mock 测试 |
| H05 | 在 Host 拒绝文件写入的情况下尝试覆盖测试文件 | 拒绝被明确报告，文件保持不变，不通过本地 Node 绕过 |
| H06 | 通过 `code_git_status` / `code_git_diff` 查看隔离工作区状态 | 真实 Host 子进程结果与 `git` 一致；拒绝/不可用不伪装成功 |
| H07 | 在已获 Host 权限且 Profile 开启 `execution.allowWorktreeWrites` 后执行工作树创建；再验证拒绝路径 | 允许时创建隔离工作树，拒绝时无新目录或分支；不得在主工作区做危险测试 |
| H08 | 调用 `code_lsp_probe`，然后重载及停用插件 | 可用性如实报告；重载不重复注册，停用后工具/Skills 恢复 Host 原状 |
| H09 | 配置只读 GitHub 连接（可选，使用最低权限隔离凭据） | 不回显 Token，`github.allowWrites` 默认为 `false` |
| H10 | 比对已安装 Host 与上游 `FsWriteIntent` 协议 | 记录实际版本和成功/失败调用；不得仅因方法存在就认定兼容 |

## 本轮修复专项回归（H11–H13）

| 序号 | 真实宿主操作 | 验收证据 |
| --- | --- | --- |
| H11 | 在隔离 Node 项目中先保持 `execution.allowCommands: false` 调用 `code_verify`，再经真实 Host 明确授权，执行一个已在 package.json 声明的 `test` 或 `test:unit` | 未授权时明确阻断；允许时报告真实退出码及检查结果，不绕过 Host |
| H12 | 仅用一次性、无外部副作用的测试脚本触发超时或主动取消 `code_verify` | 返回已中止或结果未确认；不会自动重试；检查 Host 进程是否真正退出，不能仅凭 AbortSignal 断言完成终止 |
| H13 | 在隔离 Git 仓库中调用 `code_delivery_gate`，依次检查未完成 Todo、Host 禁止执行，以及正常完成的验收 | 未完成任务不执行验证；拒绝权限时停止；验证后会话状态收口，不出现 UI 长时间持续转圈；保留日志中的实际 `turn/end` |

若当前 DSH 无法支持受控写入契约，H10 标记为“阻断/不适用”，不可使用本地 Node 权限绕过验证。所有含写入的测试必须在一次性目录中进行，禁用生产密钥与真实业务仓库写操作。

## 证据与收口

逐项记录：`case_id`、`DSH 版本`、`插件 HEAD SHA`、`平台`、`步骤/输入`、`预期`、`观察结果`、`通过/失败/阻断`、`脱敏日志路径`。失败时记录 Host 返回的可公开错误码，不上传任何 Token、私密工作区内容或环境变量值。

只有完成真实 DSH 宿主验收并取得可核对的证据后，才可声明 Host 兼容；中央 CI、mock Context 测试、Profile 启动存活和只读诊断均不代替宿主验收。本轮验收不自动授权发布或部署，A/B 对照须在宿主检查完成后另行运行。
