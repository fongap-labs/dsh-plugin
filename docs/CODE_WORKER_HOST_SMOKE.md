# Delta Code Worker · 真实 DSH 宿主验收

> 适用对象：`packages/dsh-delta-code`，集成主线 PR #211。此清单是**待执行的真实宿主验收步骤**，不是已通过的测试报告。

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

## 证据与收口

逐项记录：`case_id`、`DSH 版本`、`插件 HEAD SHA`、`平台`、`步骤/输入`、`预期`、`观察结果`、`通过/失败/阻断`、`脱敏日志路径`。失败时记录 Host 返回的可公开错误码，不上传任何 Token、私密工作区内容或环境变量值。

只有完成真实 DSH 验收并取得有效的独立安全审查后，才能解除 PR #211 的 Draft 阻断。中央 CI、mock Context 测试和只读诊断不代替真实宿主验收。
