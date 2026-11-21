# 可信 GitHub Skills 版本与撤销治理

## 信任边界

- 运行时只读取仓库内经过审查的静态目录，不下载或执行远程目录、安装脚本及二级资源。
- 每个已准入 Skill 必须同时固定 Git Commit SHA、Skill 文件 Git Blob SHA、来源仓库、路径、Skill 元数据名称和 SPDX 许可证。
- Provider candidate 的 locator 使用 `commit:blobSha`。只要 Commit 或文件内容版本变化，旧 candidate 就不能被新 Provider 加载。
- 目录版本由 `APPROVED_GITHUB_SKILLS_CATALOG_VERSION` 管理。任何新增、替换或撤销都必须递增版本。
- 撤销记录是代码仓库内的审查 tombstone，不依赖远程 kill-switch 或运行时可变的第三方服务。

## 临时调用与长期准入的区别

- 用户或 Agent 为当前任务临时借鉴一个公开 Skill，不应被长期可信目录的两阶段 PR/CI 流程默认禁止。
- `code_github_skill_temporary_use` 只在请求时匿名读取固定 Commit/Blob、验证相应免费许可证，排除风险信号、未知成本、相对依赖和过长正文，然后将有限的 Skill 指令作为**当前会话内不可信参考资料**交给 Agent。
- 此操作不注册新的 DSH Skill Provider、不安装或自动运行脚本、不更改目录、权限、工作区或永久存储。对脚本、网络、写入等后续动作仍需独立取得原生 Host 权限。
- 尚未审清的付费、依赖、风险或来源不明的 Skill 不可自动临时使用；可先保持只读审核，不能以“临时”为由绕开安全检查。
- 临时文本一旦返回，可能仍存在于当前 Host 会话上下文；卸载 Provider 不能倒流删除已进入模型上下文的文本。反复使用且希望长期自动发现的版本，才进入下面的完整准入治理。

## 新增或升级

1. 从公开 GitHub 来源发现候选；候选搜索结果不构成准入证据。
2. 固定完整 40 位 Commit SHA，读取该 Commit 下精确的 `SKILL.md` 和许可证证据。
3. 独立计算 Git Blob SHA（`SHA1("blob " + byteLength + NUL + bytes)`），核对文件名、Frontmatter name、来源路径和许可证。
4. 审查完整 Skill 内容、相对引用、脚本、依赖、外部下载、权限要求、维护状态和供应链风险。不能完整审查的候选不得进入目录。
5. 更新 `trusted-github-skills.ts` 的目录项和 `APPROVED_GITHUB_SKILLS_CATALOG_VERSION`，同步更新任务关键词。
6. 为新版本补充哈希、版本隔离、取消、许可证和任务匹配测试；更新 changelog，并通过 Linux、Windows、安全和 PR 治理门禁。

## 撤销

1. 从 `APPROVED_GITHUB_SKILLS` 移除被撤销的活动版本。
2. 在 `REVOKED_GITHUB_SKILL_REVISIONS` 增加 tombstone，必须记录 Skill name、Commit SHA、Blob SHA、撤销日期和具体原因。
3. 递增目录版本；测试旧版本不再出现在推荐或 Provider list 中，旧 candidate 在新 Provider 中返回 `undefined`。
4. 合并后发布/更新插件。DSH 原生 Provider 注销会使 Host 失效目录缓存；注册生命周期 AbortSignal 同时取消未完成的远程加载。
5. 若替换为安全的新版本，必须作为新的独立目录项重新完成审查。旧版本 tombstone 不得删除或复用。

## 撤销语义与限制

- 撤销对新目录发现和新内容加载立即生效于新插件版本；对卸载时仍在进行的加载，Host 注册信号会取消请求及响应流读取。
- 旧 candidate 携带旧 Commit 和 Blob SHA，新 Provider 不接受它；不能只比较 Skill 名称。
- 已经加载并进入既有模型上下文的文本无法被追溯删除。需要硬性隔离时，更新插件后结束旧会话并开启新会话。
- 运行时不从网络获取撤销清单，避免把第三方在线配置变成新的信任根。因此，紧急撤销仍需通过仓库门禁发布修订后的插件；不得宣称远程瞬时撤销。
- 旧版 Host 若不支持 Provider disposer，无法保证自动撤销；必须标记为不满足撤销验收，不得以静态模拟测试替代真实 Host 证据。

## 当前目录状态

- 目录版本：`1`
- 活动 Skill：4 个，均固定 Commit SHA 与 Blob SHA。
- 撤销 tombstone：0 个；当前没有已知需要撤销的目录版本。
- 自动发现候选处于未准入或待 CI 复核状态，不允许直接写入活动目录或在运行时当作可信 Skill。
- 治理原则为免费许可与完整依赖自动审核、固定 Commit/Blob、中央 CI 准入及原生 Host 按需使用；对于可证明为低风险的候选，不附加默认逐项人工批准。费用、依赖、权限或安全证据不足时阻断并升级处理。
- 自动准入事件续接代码已在中央 Action Worker 合并；仍缺少真实低风险免费候选从第一阶段 PR 到第二阶段目录晋级、发布及原生 Provider 生效的端到端证据。临时调用仅作为任务参考，不代表目录晋级、已安装或长期可信。
