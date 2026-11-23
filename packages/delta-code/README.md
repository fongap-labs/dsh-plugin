# delta-code

DSH (DeepSeek Harness) 编程插件 / Bundle（Host Plugin）。

## 能力


### Offline session assessment

For exported DSH Markdown transcripts (not raw compressed session databases), use the repository-local offline analyzer:

```bash
node scripts/analyze-code-worker-session.mjs --session session.txt --format markdown
node scripts/analyze-code-worker-session.mjs --session session.txt --format json
```

The analyzer reports Delta Code vs native/other tool calls, explicit tool errors, nonzero exits, observed failures and same-argument repeat candidates for one session. It accepts multiple `--session` inputs for pooled observational totals, not experimental groups. It never exports raw arguments, tool responses, credentials or transcript paths. It does not store or upload sessions. These counts do not prove task completion and differ from the in-session `code_execution_stats` tool.

`code_execution_stats` 提供当前 DSH 原生会话内的临时、只读执行质量计数，包含 Delta Code 工具调用、重复请求、失败分类、验证通过/失败和交付门禁状态。以随机密钥 HMAC 计算最多 64 个近期参数指纹，仅保留指纹及计数，不保存实际参数、文件内容、密钥、令牌，也不向外部发送遥测；插件卸载即清除。缺少原生会话身份时返回 `unavailable`，不跨会话聚合。重复调用不必然是无效操作；统计不包含 Harness 原生工具、内部自动重试或模型 Token，不得据此宣称整体任务完成率。

| 工具 | 说明 |
| --- | --- |
| `code_multi_edit` | 在工作区内顺序批量编辑，支持覆盖、字面量替换、`dryRun` 及默认多文件 `preflight` 整批预检；拒绝同条编辑混合 `content` 与 `find`，写入阶段不保证事务原子性；可选版本保护补偿恢复；普通逐项查找替换会在写盘前复核来源内容。 |
| `code_git_status` | 解析 `git status --porcelain=v1 --branch`，返回分支、领先/落后、已暂存/未暂存/未跟踪清单。 |
| `code_git_diff` | 返回 `git diff` 原文，可用 `staged` 取暂存区差异、用 `path` 限定单文件。 |
| `code_lsp_probe` | 探测配置的 LSP 服务端是否在 PATH 中可用（`--version` 探测），输出逐语言结论。 |

除工具外，插件还通过 `ctx.systemPrompt.section()` 注入一段编码工作流指引（与 `TOOL_EDIT` 同级排序），提示模型优先使用批量编辑与 Git 工具。

### 实测问题修复：子进程注入与多仓库检索

Delta Code 将 `tools` 和 `subprocess` 声明为正式 Cordis 必需服务，避免工具已注册但调用时产生 `cannot get property "subprocess" without inject`。若 Host 未挂载原生 `subprocess`，插件保持未激活，不用 Node 本地进程绕过权限；修复后需重新构建并安装插件才能生效。

`code_workspace_map` 默认工作区不是 Git 仓库时，会只扫描直属子目录，按安全边界及数量限制发现真正的 Git 仓库，返回附带子目录前缀的相对路径。查询使用正向关键词匹配：中英文混合、不匹配的额外词不再抵消已命中的文件名。显式 `cwd` 仅检索指定路径，不擅自跨仓库搜索；宿主拒绝执行、超时、截断或不完整的 Host subprocess 均不允许退回 Node。

工作区搜索失败后应使用宿主原生文件搜索定位，而不是重复相同失败调用或读取完整的大型文件索引。自动降级仅限已授权的发现/只读操作；不提供绕过权限的进程或文件访问。

### 声明式任务路由和资源策略

编程任务关键词由 `delta-code-strategy/builtin-task-signals.ts` 统一维护；有序路由规则位于 `task-routing.ts`，资源触发条件与相应指导文本位于 `task-resource-policy.ts`。新增技能或资源不需要在匹配引擎中增加分支。宿主适配层允许注入经过审核的 `DeltaCodeRoutingPolicy`（`routeRules`、`resourceRules`），未注入时保持现有中英文默认识别结果。

工作流模式（快速修改、缺陷诊断、PR/CI、研究及计划执行）和技能装配顺序已移至 `delta-code-strategy/workflow-policy.ts` 的 `DEFAULT_CODING_WORKFLOW_RULES`，`workflow-route.ts` 只执行确定性匹配、任务依赖波次规划和强制安全检查。可信策略装配可以通过 `deltaCodeStrategy` 的可选 `workflowRules` 注入审核后的规则；`code_workflow_route` 工具参数与原调用保持一致。

策略输入仅限可信插件代码，不从模型输出、GitHub 仓库内容、外部 Skill 或动态配置中执行任意正则。禁用 Delta Code、禁用外部 Skills、续接当前任务、当前用户消息校验与真实 Host 权限均不可由策略规则覆盖。即使错误的规则请求并行，仍必须是规划型 feature/refactor、宿主原生子代理已确认可用且每项任务有不重叠的显式写入集合；其他任务顺序执行。必要权限、破坏性操作审批、CI 失败或证据缺失的阻断条件始终强制执行，策略不可替换。资源提示只指引使用已有授权工具，不会自动安装 MCP 或远程脚本。规则变化使用单元测试和真实 Harness 验收，不引入 A/B 试验。

`code_capabilities` 现在支持只读 `plan`：可信目录中的 `requires` 是强制前置能力，`uses` 仅表示可选关联，不会自动被加载或调度。工具接受宿主已验证的 `completed` 与当前 `active` 能力 ID，计算拓扑波次、就绪/阻塞状态和去重后的建议 Skill 列表。它不运行工具、不创建独立任务数据库、不自动启动子代理；同波次不表示取得了并行写入授权。运行时是否真正加载、成功、卸载，仍由原生 Harness 的会话、权限和生命周期控制，需真实 Host 验收。

## 宿主兼容与依赖

### 免费 Skills 与工具原则

Delta Code 默认只检索、推荐和加载具有免费使用依据的 GitHub Skills。公开发现与指定仓库搜索均会读取固定 Commit 的 `SKILL.md` 和可识别的免费许可证证据；需要付费 API、订阅、购买额度，或者包含尚未核对的附属脚本/引用文件的候选，**不进入推荐列表**。许可证缺失或收费情况不清楚也按不满足条件处理；仅根据 Star、仓库公开或 GitHub 的许可证标签不能断言免费。

已审核的 GitHub Skills 只有许可证属于经审查的免费许可证集合才会展示，`get()` 在加载时仍核对固定版本正文并拒绝明确付费或依赖成本不明的内容。原生 Harness 技能和 MCP/网络工具必须先核实无付费要求：有订阅、按量收费、免费试用结束自动扣费、超额付费或者费用未知时不得自动选择。**Delta Code 无法强制拦截由宿主或其他插件单独发出的所有工具请求**，因此通过自动路由、技能指导和自身 GitHub Provider 三层约束；宿主若不能提供免费使用证据，应停止相关外部调用而非猜测。

免费开源许可只证明使用这些文件有开放许可证依据，不保证外部 API、托管服务或未来收费政策。使用第三方 Skill 仍需独立安全审核、权限确认以及固定版本核验；本次不自动安装未经审核的候选，也不通过旧式 `skills.register()` 回退。

### 匿名公开 Skill 审核

新增 `code_github_skill_public_review`：不使用任何 GitHub Token，在 GitHub 公开 API 中根据候选 `repository`、`path`、固定 `commit`、`sourceBlobSha` 和 `licenseBlobSha` 重新核对 Git Commit、Git Tree、普通文件类型与文件内容。最多发出 4 次匿名只读请求，校验免费许可证和付费依赖，并报告命令执行、秘密凭据访问、提示词指令覆盖及外部网络依赖等静态风险信号。不会执行或回显未经审核的 Skill 正文。

工具仅产生 `static-review-ready`、`manual-security-review-required` 或 `excluded-paid-or-unknown` 的**证据报告**。即使标记 `static-review-ready`，也**不自动授权、收录、注册 Provider 或执行脚本**；此前的免费筛选只代表部分可核实证据，不能证明外部服务永不收费。所有静态分析都有漏报可能，受审核的可信目录准入仍需独立 CI 与权限检查。

### 免费 Skill 的 CI 准入 PR

`code_github_skill_propose_pr` 用于将已发现的免费 Skill 候选提交为 **仅供 CI 复核的不可执行清单**。输入公开来源仓库、`skills/name/SKILL.md`、不可变 Commit、源码 Blob SHA、许可证 Blob SHA，以及准入清单目标仓库 `targetRepository`。工具会重新调用无 Token 的 `code_github_skill_public_review`；只有收费检查通过、静态风险信号为空且固定源证据一致时，才可提交 PR。

提交需要显式 `submit: true` 和已开启的 `github.allowWrites`。工具仅通过目标仓库本身绑定的 Token 调用现有 `code_github_branch`、`code_github_commit_file`、`code_github_create_pr`，创建功能分支、写入 `packages/delta-code/skill-proposals/*.json`、更新 CHANGELOG，并请求中央 CI；不借用公开 Skill 开发者的 Token，也不向来源仓库写入。清单包含完整不可变来源证据、`pending-ci-review` 状态与强制的 `autoEnabled: false`、`executable: false`；CI 会拒绝格式错误、额外字段或擅自启用的清单。

**CI 合并清单只意味着候选已被记录，不表示 Skill 已获安全认可。** 经独立审查完整依赖、提示词注入风险和工具权限后，仍需单独变更现有静态可信目录，才能让 Harness 按需加载。静态规则存在漏报，不会因 Star 或免费许可证而自动授权执行。

### 可信 Skill 目录的最终 CI 准入

`APPROVED_GITHUB_SKILLS` 仍是运行时唯一的外部可信 Skill 目录。新增或替换条目时，除了先前合并的 `skill-proposals/*.json` 不可执行候选记录，还必须在单独的 PR 中提供 `skill-admissions/*.json` 审核证据：固定来源 Commit、Skill Markdown 完整 UTF-8 正文、许可证完整正文、对应 Git Blob SHA，以及严格只读的权限说明。

中央 CI 的 `delta-code-skill-catalog-admission.test.mjs` 会验证每个新增可信条目是否与上述证据一一对应、Git Blob 哈希及免费许可是否吻合、是否存在收费依赖、外部网络/命令/秘钥访问及未核对的附属文件。缺失证据、费用不明、版本没有递增、未知或越权权限、目录路径不匹配时 **直接红叉**。原来已审核的四项 Skill 由固定不可变的历史信任根识别，不能拿它们冒充新版本或新增技能。审核证据文件本身不是运行时注册入口，只有经 CI 允许并合并的静态目录变更才能被 Harness 的原生 Provider 按需加载。

这属于可重复的**离线、静态安全与完整性门禁**，不能取代人工对自然语言提示词和复杂供应链的独立审查，也不保证任何外部服务永远免费。新目录必须保持只读文档范围，不能赋予终端执行、文件写入、读取凭据或外部网络调用权限；用户权限仍由 Harness 决定。

### GitHub Skill PR 回执与凭据边界

`code_github_skill_propose_pr` 与 `code_github_skill_promote_pr` 均在写入前核对目标仓库绑定的 GitHub 账号，并逐步核对分支 SHA、文件路径和提交回执。提交 PR 后仅认可属于同一目标仓库、具有对应 PR 编号的 `https://github.com/.../pull/...` 链接。候选 PR 在创建分支前先读取 CHANGELOG，分支创建后通过固定 SHA 重新核对；若基础文件变化，直接停止，不将不确定写入解释为成功。匿名来源审核不使用目标仓库 Token，绑定的不同账号或组织之间也不借用 Token。

### 真实 Cordis 生命周期回归验收

`tests/delta-code-cordis-skill-task-lifecycle.test.mjs` 使用实际 `@deepseek-ai/cordis` Context 装载 Delta Code，并提供可控的原生 Skills/Tools 服务替身。测试覆盖两个 Agent 并行请求的互不干扰、同任务续接、切换任务中止正在读取的 Skill、用户禁用外部 Skill、Agent 释放、插件卸载以及 Host Skills 服务撤销后重新挂载。外部 HTTP 被本地未完成请求替代，不调用付费服务，也不伪装成真实 DeepSeek Harness 桌面 UI 的手工验收。正式客户端还需单独核对技能在官方 Host 界面中的实际显示和调用行为。

### 可信目录升级 PR

`code_github_skill_promote_pr` 为前一步**已经合并**的免费 Skill 候选清单生成独立的可信目录升级 PR。它先匿名重新核对原仓库不可变 Commit、Skill/许可证 Blob，确认目标仓库已有相同的 `skill-proposals/*.json`，之后只使用目标仓库绑定的 Token 提交 `skill-admissions/*.json`、`APPROVED_GITHUB_SKILLS` 新条目、目录版本递增和 CHANGELOG。生成的 Skill 名称、描述与关键词来自经过规范化的源目录标识，不直接嵌入未经信任的自然语言。

该工具必须显式提供 `submit=true` 且启用 `github.allowWrites`。创建分支前检查原候选与当前静态目录，创建后再次按固定 HEAD 核对内容。所有文件依次通过现有 GitHub 非强制快进提交工具写入；冲突、来源变更、免费证据缺失、权限风险或只读审查不通过时直接停止，**不自动重试写操作或绕过 CI**。

升级 PR 完成三项中央 CI 门禁并合并之后，才会随新版本的静态可信目录出现在 Harness 的原生 Skills Provider 中，且仍是按需读取，而不是立即执行命令。静态检查不能保证自然语言安全；候选完整性、权限与收费条件必须继续由独立复核判断。工具不会在发现时自动启动付费搜索，也不会从其他 GitHub 账号借用 Token。

### GitHub Skill 候选评分（仅用于推荐）

`code_github_skill_candidates` 对指定已授权仓库中的候选返回可解释的公开证据信号：Star 数量（对数封顶）、Fork 数量、维护者公开账号建立时间、仓库建立时间及最近推送时间。评分权重集中放在 `github-skill-ranking.ts`，默认合计上限为 50 分，支持由可信代码提供其他权重，不将热门度解释为 Skill 的正确性或安全性。元数据缺失时给出 `partial` 或 `unavailable`，不臆造评分。禁用或归档仓库的建议分归零；搜索结果中的候选始终为 `unreviewed`，不可凭评分自动注册或执行。

查询依旧限制到与 GitHub Token 绑定的仓库归属：搜索时最多额外请求一次该仓库的公开指标与一次对应 owner 的公开资料，失败可在限流/不可用时降级为无评分；绝不把该 Token 作为跨组织查询的通用授权。新增 `code_github_skill_discover`：在确有必要且用户允许外部技能时，通过**独立、不带 Token 的公共 GitHub 仓库搜索**查找候选仓库，再检查最多 3 个仓库的固定 Git 树，输出 `skills/name/SKILL.md`、Commit 和 Blob SHA，并与 Star、维护活跃度和账号资历评分组合排序。每次调用不超过 19 次公开请求，响应体限制为 1 MB；被限流时停止，不借用其他账号的 Token。该方案是**全 GitHub 范围的有限仓库发现**，不是逐文件搜索整个 GitHub，也不会默认后台扫描。搜索索引、前 8 个仓库和所支持的 Skill 路径均限制覆盖范围；候选全部标记为 `unreviewed`。

已提供匿名 `code_github_skill_public_review`，可以验证跨组织公开候选的不可变源码与许可证证据，但不能把静态审核当成可信批准。对于已绑定组织，`code_github_skill_review` 继续使用该组织独立 Token；新准入工具只自动提交不可执行清单，不能自动启用未经完整审核的 Skill。

### Skills 能力检测与按需生命周期

Delta Code 不使用旧式 `skills.register()` 作为兼容降级。仅当 Harness 提供可注销的 `skills.registerProvider()` 接口时，才启用内置编程 Skills 与经过审查的 GitHub Skills。Provider 的 `list()` 只返回名称、描述等元数据；用户任务实际需要某项 Skill 时，Harness 原生 `skill` 工具通过 `get()` 按需获取正文。自动路由只提示选用技能，不再在系统提示词中预先展开完整内容。

远程 GitHub Skill 的请求会同时遵守宿主调用与 Provider 生命周期取消信号。当前 Harness 官方 `SkillViewOptions` 还会把 Agent `scope` 传给 Provider；Delta Code 利用该能力在同一 Agent 开始新任务、显式拒绝外部 Skill、Agent 结束或插件卸载时取消**尚未完成**的网络读取，互不影响其他 Agent。明确拒绝外部 Skill 的任务会从该 Agent 的可用 Skill 目录中隐藏远程候选，并通过官方 `invalidate()` 更新宿主目录；续接同一任务不会无故中断读取。若宿主未提供 `scope`，只依赖官方调用 `signal` 与 Provider 生命周期，不推测 Agent 身份。

这不是删除历史消息：已加载的 Skill 正文作为原生工具结果保留在会话历史中，Delta Code 不修改或删除它。完成任务时也不卸载共享 Provider，以免影响其他 Agent；新的任务切换会释放上一任务仍在进行的远程请求。Harness 没有公开的任务完成事件可用于清除会话历史，因此不能声称所有技能文本会在任务完成后被自动移除。

### Harness 集成验收

中央 CI 现在使用真实 `@deepseek-ai/cordis` 的插件生命周期，挂载模拟的 `tools`、`skills` 和 `systemPrompt` 服务，验证：Skill Provider 只公开元数据、`get()` 按需加载、同一 Agent 的消息续接、其他 Agent 隔离、卸载注销，以及 Host 不提供可注销 Provider 时仅关闭技能。此项是**实际 Cordis 框架 + 模拟 Harness 服务**的集成测试，不等同于真实 DeepSeek Harness 客户端验收。

接口依据：Harness 官方 [Skill Provider 说明](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/skill/skill/README.md) 确认 `registerProvider()` 同步注册、返回可注销 disposer，`list()` 提供目录而 `get()` 按需读取内容。实际子代理需要遵循官方 [Subagent 能力与权限文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/subagent.md)。

在安装了 Delta Code 的实际 Harness 中，仍需验证以下行为并保留本机证据：

1. 调用 `code_host_probe`，记录读到的 Host 服务能力；它只验证方法存在，不验证写入权限。
2. 发出「修复一个 CI 红叉」任务，检查自动路由到 `code-ci-repair`；续发「继续推进任务链」，确认沿用同一任务。
3. 查看原生 Skill 目录，确认 `code-root-cause-debugging` 等本地 Skill 可发现、正文不预加载；明确调用原生 `skill` 工具后才读取正文。尝试重新加载/卸载插件，验证目录不重复、不残留旧 Provider。
4. 使用显式不同的任务路径调用 `code_workflow_route`。只有原生子代理真实可用、用户授权和写集无重叠时才考虑并行；仅传入 `nativeSubagents: true` 是规划输入，**不能作为已授权启动子代理的证据**。没有能力或授权时必须顺序执行，且不得自建 Agent Runtime。
5. 在任务中明确要求不使用外部 GitHub Skills，检查不会加载或推荐外部 Skill；退出或切换任务后再确认状态隔离。
6. 插件退出后再次进入 Harness，确认插件工具与动态提示的注销和重建，不出现旧实例重复注册。

若实际 Harness 版本缺少 `skills.registerProvider()` 或不能返回注销函数，应按能力检测关闭对应 Skill，不允许回退 `skills.register()`；把实机差异、接口形状和复现步骤回填测试，不能将模拟通过称作实机通过。

Host 不提供 `registerProvider` 或注册后没有返回注销函数时，**对应技能功能关闭，不回退旧式注册接口**。若一个不合规 Host 已登记无法注销的 Provider，Delta 会立即将其置为不可用并请求宿主刷新目录；核心编辑、GitHub、LSP、工程验证功能继续按各自能力运行。卸载插件/Host 子上下文时注销可释放的 Provider 并取消远程加载。**已进入历史会话上下文的技能文本不能被插件追溯清除**；需要完整隔离时应开启新会话。此能力以接口检测为准，不以 Harness 版本号判断。


与 `dsh-ui-delta` 一致，Delta Code 使用 Harness 的原生 `ctx.tools` 工具注册服务，不将 `@deepseek-ai/dsh-tools` 作为发布包的运行时或 peer 依赖。它的 TypeScript 类型仅供开发时校验，编译后不会强制安装另一份 Host tools。工具注册前仍检查宿主服务是否存在；缺少服务时工具不可用，不会绕过 Harness 的权限或沙箱。

开发构建继续使用仓库锁文件中固定的依赖，**固定开发依赖不等于限定宿主可运行版本**。兼容性由宿主服务接口、回归测试及真实宿主验证共同决定，而不是把每一个候选版本硬编码到包元数据中。若未来 Harness 接口发生不兼容变更，应适配接口并增加验证，而不是无条件声称兼容所有版本。

已发布的旧版包不会因为仓库源码更新而自行改变依赖声明。修复合并并发布新版本后，需要安装新版本才能解除旧版本的安装拦截。

### 本地文件句柄锚定（Linux）

当 DSH 未挂载 Host FS 时，Linux 本地兼容路径通过 `/proc/self/fd` 与逐级打开的目录句柄进行文件读取和写入；父目录在打开后被替换，不会把后续路径解析转向工作区外目录。写入也拒绝最终符号链接、非普通文件与多重硬链接（避免经硬链接覆盖外部文件）。该路径需要可用的 `/proc/self/fd`；无法使用时明确失败，不回退到非锚定写入。

Windows/macOS 的本地兼容路径改为**先打开文件句柄，复核工作区根目录、父目录、目标真实路径及打开句柄的文件身份，再读取或截断写入**。写入不会在安全复核前使用 `O_TRUNC`；拒绝持久符号链接、非普通文件与多重硬链接目标，并响应取消信号。新建文件可能在校验失败前留下空文件，需要清理。

该策略可缩小普通并发修改和路径替换导致的风险，但**无法完全消除恶意父目录并发置换竞态**：Node 文件路径检查无法替代操作系统的目录句柄相对寻址，尤其 Windows reparse point/junction。严格隔离场景应挂载受信任的 DSH Host FS；Linux 的目录句柄锚定同样不提供跨文件事务原子性。所有宿主授权继续由 DSH 负责。

### 批量编辑宿主身份与写入不确定性

`code_multi_edit` 在预检时，若 DSH Host FS 提供 `resolve/contains`，会对每个目标的宿主规范身份进行对比；同一文件即使通过不同路径、别名或大小写访问，也拒绝在同一批次中重复修改。对旧版未提供 `contains` 的 FS，保留原有路径去重行为；严格的 `guarded-intent` 写入仍要求宿主包含关系校验。

预检写入或逐项写入如果在调用宿主写入后出现异常，结果会明确提示「Host write outcome unconfirmed」，要求检查目标后再重试；不能把抛错等同于确认未修改。开启受控恢复时，只回滚宿主返回版本的已确认早期写入；失败目标不能凭空重写或自动删除。本能力不提供跨文件事务原子性。

### 批量编辑部分失败与受控恢复

`code_multi_edit` 新增可选参数 `rollbackOnFailure: true`，**仅在** `preflight: true`、非 Dry Run、`execution.fsWriteContract: guarded-intent` 且所有目标均为现有、可读取、带版本的文件时启用。开启后，预检保存每个文件修改前的内容（单文件上限 2 MiB）；成功写入必须由宿主返回该次写入的版本。若后续写入失败，插件按逆序尝试以 `replaceIfVersion` 恢复已确认成功的写入。

恢复遵守宿主原生授权和取消信号；如果文件已再次改变、宿主拒绝、写入结果缺失版本或操作已取消，**不允许无条件回写**。响应包含可见的 `rollback` 统计；恢复调用不仅必须成功返回、携带有效的宿主版本令牌，还需重新读取目标并确认内容等于预检快照；读回失败、内容不一致或取消均标记为**恢复状态未确认**，不能报告成功。读回仅提供额外证据，不保证跨文件事务原子性。逐项结果会说明已验证恢复、恢复失败或结果不确定的修改。失败的那一次写入可能有不确定结果，需人工核对。

不支持自动删除本批次新建的文件，不保证跨文件事务原子性，也不自动开启恢复。多文件批量编辑默认先预检；显式 `preflight: false` 保留旧行为。该能力仍需真实 DSH Host 验收。

### DSH Host FS 写入协议

使用 `execution.fsWriteContract` 明确选择实际宿主的写入契约：

- `legacy-overwrite`（默认）：沿用当前锁定 DSH SDK 的 `writeText(target, content, 'overwrite', signal)` 行为，不修改现有用户配置。
- `guarded-intent`（显式开启）：对照上游 `FsWriteIntent`，必须具备宿主 `resolve/contains/stat/writeText`。宿主返回已有文件的版本后执行 `replaceIfVersion`；不存在则执行 `createIfAbsent`。批量预检时会固定版本或“文件不存在”的条件，后续写入不得改用更新后的版本；并发导致版本变化时由宿主拒绝，插件不会改为无条件覆盖。

无法安全地通过函数参数数量或写入探测判断宿主协议，因此不会自动切换。选择新模式却缺失 Host FS、文件版本、路径权限或必需方法时，将明确拒绝操作；所选协议不匹配时需要人工校正设置。此适配只证明接口调用与模拟测试，**不等于实际 DSH 写入审批或端到端验收完成**。


### 多仓库与工作树隔离

`code_workspace_map` 在 Host FS 挂载时通过原生 `listDir/lstat/resolve/contains` 发现直属子仓库，所有 Git 文件枚举走 Host subprocess，绝不退回插件本地目录读取；有界发现、符号链接拒绝及跨仓路径过滤仍保留。`code_git_worktree` 的列举、显式授权创建及受管工作树清理均使用宿主 `processPath`，目标和已有父目录由 Host FS 检查，父目录符号链接或新建目标已存在时阻断；并发同名工作树由 Git 的分支/目录唯一性最终拒绝冲突。清理需 `allowWorktreeWrites`，只接受明确注册的 `code-worker/<task>` 分支、干净工作树，使用非强制 `git worktree remove`；只有显式请求时才尝试 `git branch -d` 删除已合并分支。未挂载 Host FS 时继续使用本地兼容路径。

### 基础 Git 与 GitHub Origin 的跨模块一致性

`code_git_status`、`code_git_diff` 和未显式指定仓库时的 GitHub `origin` 检查使用同一 Host FS 工作区授权与 `processPath` 执行目录。挂载 Host FS 后，禁止从本地 Node 读取远程工作区或在宿主子进程拒绝后降级执行。Diff 的 `path` 以工作区根目录为基准，必须处于所选 `cwd` 仓库内，且被转换为 Git 字面量 pathspec；远程 Host 以原生 `resolve/contains` 决定真实路径，避免从 A 仓库探查 B 仓库或逃逸符号链接。无 Host FS 时保留本地路径兼容校验。以上为自动化契约测试，不代替真实 DSH 宿主验收。

### Git 工作区宿主授权

`code_resume` 和 `code_delivery_gate` 的 Git 工作目录统一遵循宿主权限：安装了 DSH Host FS 时，使用原生 `resolve/contains/stat/processPath` 确认目录并获取子进程的执行路径，Git 和交付测试均使用同一宿主执行路径；宿主拒绝、接口缺失、目标不是目录或路径越界均直接阻断，绝不改用 Node 本地 `realpath`。仅在未安装 Host FS 时使用原有本地真实路径检查；Git 命令仍必须通过 Host subprocess 执行。此变更需要真实 DSH 运行验证，不以模拟测试代替宿主验收。

### 跨轮恢复与基线核对（P0）

`code_resume` 在**同一个 Agent Session** 内读取 DSH 持久化 `todo/write` 事件的最新有效快照。普通 `todos` 投影在 `turn/start` 时清空，因此续接使用单独的**只读宿主投影**保留最后的任务快照；不新建数据库、不写入独立任务文件，也不调度第二个 Agent。重新打开相同 Session 时由 DSH 原生投影机制回放历史。

通过 DSH Host 子进程只读获取当前 Git HEAD 和工作区状态；若传入旧检查点的 `expectedHead`，HEAD 不一致直接 `blocked`。未提供旧 HEAD 或存在未提交修改时返回 `reconcile`，要求先检查现有代码与历史完成证据；基线匹配、工作区干净且确有待办时才返回 `resume`（仅为可续接建议，不等于验证通过）。历史缺失时返回 `empty`，全部 Todo 标记完成时返回 `complete`，宿主拒绝或不完整时返回 `blocked`。

此工具不会执行文件修改、Git 写入、测试、合并或发布；续接后仍应通过 `code_delivery_gate` 做真实测试与最终核验。它只识别当前 Agent Session，不能推断其他会话或子代理的任务。模拟回归不能替代真实 DSH H01–H10 安装与权限验收。

### 持续执行与交付核验（P0）

`code_resume` 可使用 `expectedSeq`（原生 Todo 写入序号）与 `expectedHead`（Git 基线）拒绝过期续接，仅对明确临时故障有限重试只读 Git。`code_verify_suite` 区分权限、临时依赖故障、验证失败和未知结果，但不自动重跑可能有副作用的测试命令。

`code_delivery_gate` 在最终完成声明前检查**真实 Git 状态和重新执行的测试**，而不是仅信任模型的完成描述。插件注册的原生 Todo 投影可用时，会先核对模型传入的任务列表与 DSH 持久化快照；快照缺失、状态不一致或验证期间出现新的 Todo 写入，均拒绝声称已验证。它使用 DSH 原生 `todo_write` 保存任务计划，**不创建第二套任务数据库或 Agent Runtime**。延续会话时先恢复原生 Todo 中尚未完成的任务，而不是重做已完成项目。此工具不会主动唤醒模型或在用户离线时后台执行。

调用时提供完整任务状态 `tasks`（与最近一次 `todo_write` 一致）、逐项 `taskAcceptance`（每项含与原生 Todo 对应的 `task`、明确 `criterion`、必须在本次执行的 `checks`）、当前仓库 `expectedHead`（40 或 64 位 Git HEAD SHA）、`scripts`（允许的 1–5 项 `test/typecheck/build/lint/check`）和可选 `cwd`。若仍有 `pending` 或 `in_progress`，直接返回下一项任务，**不执行任何命令**。

只有任务全部标记完成、逐项验收条件映射完整、Host 明确允许命令执行、所有脚本通过、Git HEAD 保持一致、已暂存/未暂存 Diff 格式检查通过、Git 状态及追踪文件 Diff 内容在验证前后未变化且没有未跟踪文件时，才返回 `stage: verified`。它在执行脚本之前验证整份检查清单，结果的 `taskEvidence` 仅将每项验收条件关联到本次真实通过的脚本和退出码，不把模型自报条件当成语义验收证明；Host 拒绝时不降级本地 Node；测试失败停止后续测试；发生取消直接停止。返回的结论只表明**本次自动化交付核验通过**，不等于独立审查、变更内容正确性、无竞争条件或允许自动合并。新文件应先评估并暂存，避免未跟踪内容脱离 `git diff --check` 的覆盖范围。

若要继续下一任务，可复制原生 Todo 中待办项目并重新检查当前仓库状态；不要以旧的核验结果抵充新 HEAD 的通过记录。单测使用模拟 Host 验证拒绝、失败和未完成任务行为，真实 DSH Host 仍须 H01–H10 验收。

## 安装到本地 Profile

```bash
# 根目录下安装/链接
pnpm link:dev delta-code
```

脚本会软链 `packages/delta-code` 到 `~/.dsh/profiles/<profile>/node_modules/`，
并把 `delta-code` 追加到 profile 的 `dsh.profile.bundles`。

也可使用 DSH 官方通道（等价于 `plugin_manager.install_bundle`）：

```bash
dsh plugin --profile desktop add link:/absolute/path/to/packages/delta-code
```

## 配置

配置写在 profile 的 `cordis.patch.yml`（用户层）或本包的 `cordis.patch.yml`（Bundle 层）：

```yaml
- id: delta-code
  name: 'delta-code'
  config:
    enabled: true
    workspaceRoot: ''
    git:
      enabled: true
      command: 'git'
    lsp:
      servers:
        - language: typescript
          command: 'typescript-language-server'
          args: ['--stdio']
        - language: javascript
          command: 'typescript-language-server'
          args: ['--stdio']
        - language: python
          command: 'pyright-langserver'
          args: ['--stdio']
        - language: rust
          command: 'rust-analyzer'
          args: ['--stdio']
        - language: go
          command: 'gopls'
          args: ['serve']
```

## 测试

```bash
pnpm test
```

## DSH 宿主能力诊断

在隔离的真实 DSH Profile 加载本插件后，调用 `code_host_probe` 检查本次会话实际可访问的 FS、子进程、工作目录和工具注册方法。诊断只枚举方法是否存在，不读取内容、不执行命令、不写文件，也不会探测或回显 Token。

**注意：方法存在不代表拥有写入/命令权限，也不代表 `writeText` 的调用协议兼容。** 工具始终返回 `writeContract: unverified`；必须在真实 DSH Host 上另行运行拒绝/允许编辑、Skills、工作树和 LSP 冒烟测试，记录 DSH 版本、Profile 和结果，才能完成端到端验收。

## GitHub 多账号连接

默认**无需配置 `github.accounts` 或逐个绑定仓库**：Delta Code 通过 Harness 原生凭据服务解析 `GITHUB_TOKEN`（旧版无凭据服务的 Host 使用同名环境变量），并核实它的 GitHub 登录用户；原生凭据仅用于该用户自己名下的仓库。**一个 Token 只绑定一个账号或组织，不能跨账号/组织复用**；该归属下的仓库数量不限，GitHub 根据该 Token 对具体仓库的授权决定能否访问。访问组织仓库时，须单独配置该组织的 `owner` 与 `tokenEnv`。CLI 的 `gh auth login` 凭据属于另一套存储，不会自动作为 `GITHUB_TOKEN` 提供给本插件。

如需分别使用多个 GitHub 身份，可在用户 Profile 的 `cordis.patch.yml` 中配置可选的 `github.accounts`。每个账号填写 **凭据路由名 `owner` 与宿主凭据引用 `tokenEnv`**；真实 Token 保存在 Harness 凭据服务中或由旧版环境变量提供，不写入插件配置。账号数量不限：

```yaml
github:
  enabled: true
  allowWrites: false
  accounts:
    - owner: fongap-labs
      tokenEnv: GITHUB_TOKEN_FONGAP
    - owner: my-personal-name
      tokenEnv: GITHUB_TOKEN_PERSONAL
    - owner: third-organization
      tokenEnv: GITHUB_TOKEN_THIRD
```

支持零个、一个或多个额外账号。每个 `owner` 必须使用独立的 `tokenEnv`；同一个 Token 引用不得绑定不同账号或组织。组织名是仓库归属标识，Token 仍由已获得该组织仓库授权的个人或应用颁发。推荐细粒度 PAT，仅授权必要仓库及最小权限。

调用 GitHub 工具时，省略 `repository` 则读取当前 Git 工作区 `origin`；也可显式指定 `repository: owner/repo`。配置了账号时，**只能使用与仓库 owner 相同的账号凭据**；工具可选 `account` 参数同样必须匹配仓库 owner，不允许跨归属复用。未配置账号时，原生 `GITHUB_TOKEN` 经 GitHub `/user` 验证登录归属后，仅能访问该用户自己的仓库。旧配置中的 `repositories` 字段只接受本账号下的仓库，不作为数量上限或访问允许列表。

**安全要求：** 配置文件**不保存任何 Token**，仅保存宿主凭据引用。不要将真实 Token 提交到仓库、PR、Issue 或聊天。不要明文同步 Profile 凭据文件。Token 不会返回给模型；写操作仍需额外开启 `github.allowWrites`，并且必须通过 GitHub 服务端权限校验。

| GitHub 工具 | 用途 |
| --- | --- |
| `code_github_connection` | 检查仓库连接及令牌权限 |
| `code_github_file` | 读取远程仓库文件或目录 |
| `code_github_pulls` | 查询 PR |
| `code_github_checks` | 查看 PR 检查结果、失败上下文及 Action Worker 检查链接 |
| `code_github_jobs` | 根据 `repository` + `runId` 或 GitHub Actions `runUrl` 查看运行作业和失败步骤；从 URL 自动识别实际 CI 仓库 |
| `code_github_job_logs` | 根据 `repository` + `jobId` 或 GitHub Actions `jobUrl` 读取失败 Job 的限量、脱敏日志；不依赖 annotations/artifacts |
| `code_github_branch` | 创建远程功能分支（写入需授权） |
| `code_github_commit_file` | 更新功能分支文件（写入需授权） |
| `code_github_create_pr` | 发起 PR（写入需授权） |

从 PR 的 `code_github_checks` 获得失败状态链接后，可直接将 GitHub Actions URL 交给 `code_github_jobs.runUrl`；失败 Job 链接交给 `code_github_job_logs.jobUrl`。这两种调用会从 GitHub 官方链接验证 `owner/repo` 并选择**该归属**的 Delta Code Token，不再假设 CI 固定部署在某个组织或仓库。显式 `repository` 或 `runId`/`jobId` 与链接不一致、目标归属未配置凭据时直接拒绝；不会把一个账号的 Token 交给其他组织。

写入默认关闭。设为 `github.allowWrites: true` 后才允许创建远程分支、提交文件或创建 PR，但不会直接修改 `main` 或自动合并 PR。正式 CI 和合并门禁继续由 Action Worker 管理。

`code_github_commit_file` 使用 GitHub 的 Git Trees/Commits API 创建基于当前 feature HEAD 的提交，最后执行 `force:false` 的分支引用更新。可传入 `expectedHead`（40 位 Git SHA）要求与审阅时的 HEAD 一致；分支被并发推进时，非快进更新由 GitHub 拒绝，不自动重试、不强制推送。读取已有文件时使用固定 HEAD 的树证据并保留普通文件执行权限；拒绝符号链接目标。写入可能在创建未引用 Git 对象后失败，但不能据此声明分支已更新。

`code_github_create_pr` 先查询相同仓库、head、base 下的开放 PR；发现已有 PR 就返回现有号码和 `reused: true`，不重复创建。并发创建被 GitHub 拒绝或 POST 响应丢失时，只进行一次只读查询，不再次发起 POST。401/403 权限错误直接停止；API 或网络异常的写入结果可能不确定，需要核对远程状态。此机制不自行合并或发布版本。

## 一体化工程工具

不用安装额外编程插件或 Skill 包。Delta Code 直接注册以下工具，运行时复用 Harness 的宿主能力与项目已有工具链。

| 工具 | 用途 |
| --- | --- |
| `code_workspace_map` | 用查询关键词对 Git 已跟踪的文件排序，只返回有限数量的文件名，避免整仓库占用上下文 |
| `code_git_worktree` | 查看、创建及安全清理受管工作树，拒绝未注册或未提交修改，分支删除仅用 `-d` |
| `code_verify` | 在 Harness 子进程服务中运行项目声明的测试、检查、构建脚本并返回有界证据；Node 项目允许已声明的 `test:unit` 等安全命名检查 |
| `code_verify_suite` | 顺序运行最多 5 项白名单验证，整批先预检，失败后停止并报告跳过项 |
| `code_lsp_probe` | 只在真实工作区范围内探测 LSP 可执行性；符号链接越界直接拒绝，取消时立即终止后续探测 |

写入和执行操作需要在用户 Profile 中分别显式启用，默认为关闭：

```yaml
execution:
  allowWorktreeWrites: false
  allowCommands: false
  # 只有显式声明时，交付门禁才核查新增文件的语言；默认 []
  languageConventions:
    - directory: packages/delta-code/src
      language: typescript
    - directory: tests
      language: javascript
```

`execution.languageConventions` 是可选的目录级规则（`directory` 为 Git 仓库相对路径，`.` 代表整个仓库；子目录规则优先于父目录）。仅检查相对于 `HEAD` 真正新增的 TS/JS 代码文件；已修改文件、暂存删除、声明文件（`.d.ts` 等）不受影响。通过 `git ls-tree`、`git ls-files --cached --others --exclude-standard` 获取真实 Git 文件证据，而非依照目录里 TS/JS 文件的多数派推断规则。没有声明时不执行额外的语言检查，不阻止渐进迁移。宿主拒绝文件检查时仍按现有 fail-closed 语义阻止交付。

启用 `allowCommands` 后只允许调用项目 `package.json` 中已存在的 `test`、`typecheck`、`build`、`lint`、`check` 脚本。运行项目脚本可能执行该仓库中的任意代码，应仅对可信工作区开启。没有 Harness 子进程服务时，这两项高权限工具拒绝执行，不绕过宿主执行能力与审批边界。

## 原生图形配置页面

在 DSH **插件 → Delta Code → 组件 delta-code → 配置** 打开原生配置表单。该页面通过官方 `plugins.row.config` 注册，配置通过 Host 的 `ConfigForm.mutate`（修订号冲突保护）写入当前 Profile。

- Git、执行权限、工作区、LSP、GitHub 多账号可直接编辑；权限默认关闭。
- GitHub 多账号只通过 `tokenEnv` 环境变量名引用凭据；Token 永不写入配置，页面也不会回显。
- 插件热更新接收 `loader/volatile-update` 并重新注册工具。启用后请重新安装/重载新版插件（旧 release 包不包含本页面）。

### 免费 Skill 自动准入（分阶段）

`code_github_skill_auto_stage` 在用户请求专业 Skill 且原生 `github.allowWrites` 获授权时，一次完成免费公共 GitHub 候选搜索、最多三份固定版本公开审核、并为符合低风险条件的一项 Skill 自动建立候选 PR。它不需要每次额外人工签字；不可用、费用不明、含命令/密钥/外链或完整性不足时拒绝收录。候选 PR 仍为惰性记录，不能加载执行。

候选 PR 经中央 CI 合并后，独立的 `code_github_skill_promote_pr` 才能重新审核固定 SHA 和完整证据、提出可信目录版本升级 PR；此 PR 再次通过中央 CI 并合并后，Host 原生 Provider 才允许在新插件版本中按需加载。Stage PR 经 GitHub 确认已合并，且同一 PR HEAD 的 PR Governance、CI Evidence 与 validate-merge 均成功后，`code_github_skill_auto_advance` 可再次独立审核并自动提交目录升级 PR。任一状态缺失、失败或不匹配直接拒绝；目录 PR 自身仍须通过 CI 并合并才能在新插件版本中加载。两步操作由原生 Agent 在活动会话中继续，不引入后台监控或第二套运行时。

## 语义能力目录与专项质量检查

Delta Code 提供只读 `code_capabilities` 能力目录：`action: list` 浏览场景；`get` 查询单项的目标、输入、产物及关联能力；`compose` 按 Agent 已判断的用户意图组合现有能力。关联 `uses` 仅表示可选复用，**不会**自动安装 Skill、运行命令、启动新 Agent 或授予权限。能力 ID、Skill 名称和依赖环均在注册前校验。

Harness Agent 根据任务实际语义作选择；既有中英文关键词自动路由只提供兼容提示，不覆盖用户要求。复杂任务可继续调用 `code_workflow_route` 规划执行波次和风险检查。Skill 正文仍由原生 Provider 按需获取、在宿主释放时注销。

新增三个可选专项 Skill：`code-quality-strength` 针对已修改代码核对测试断言、复杂度和有条件的变异测试；`code-diagnostic-readiness` 核对故障复发时可取得的安全诊断证据；`code-experience-review` 从真正验证的修复形成待审查经验候选。变异测试只允许使用仓库已经声明且获 Host 授权的执行入口；没有实际运行不能宣称通过。经验候选不会自动写入可信 Skill 目录，必须经过既有 GitHub PR 准入与中央 CI。

### 中央验收位置

此能力目录、依赖与循环拒绝、Host 只读工具、按风险执行的专项质量流程，在 [Action Worker 中央 dsh-plugin 验收包](https://github.com/fongap-labs/action-worker/blob/main/tests/packs/plugins/delta-code-semantic-capabilities-test.mjs) 中集中维护，并在目标仓库真实中央 CI 中执行；不能仅根据测试文件存在判断验收通过。已有源仓库回归继续双跑，直至中央覆盖对账完成，不能为了集中测试减少有效断言。

### 结构化工程经验候选

`code_experience_candidate` 将经过实际任务分析的工程经验整理为固定结构：问题、根因、修复模式、适用条件、失效边界、来源仓库及完整 Commit SHA，并包含 1–5 个 GitHub Actions Run/Job 证据链接。输入有长度、格式、重复项及明显凭据文本校验；只返回白名单字段，不写盘、不调用远端脚本。

返回的 `pending-automated-evidence-check` 表示证据**尚未由独立 CI 验证**，不能因为提供了 URL 或模型声称通过就视为成功。后续自动准入必须核对真实 Job 结果、源 SHA、免费使用依据、安全边界和宿主权限；满足准入条件后可由已有 GitHub PR/中央 CI 流程自动收录与按需使用，不要求默认逐项人工确认。未通过的候选阻断，不绕过 Host 授权；本工具本身不是自动准入执行器。

## 原生规划与执行闭环

Delta Code 借鉴工程实践中的**可执行规划**和**连续执行**，不绑定任何特定模型，也不新建 Agent Runtime：

- **小任务**：识别影响范围，执行最小修改，运行针对性验证，再检查 Diff；不强制生成计划。
- **复杂任务**：先给出目标、非目标、受影响文件、依赖顺序、验收条件和验证命令。要并行时，必须向 `code_workflow_route` 提交每个任务的显式 `taskPaths` 写入集合及 `taskDependencies` 前置索引，只有路径无重叠且原生子代理可用时才允许同波次执行；缺少写集时顺序执行。复杂缺陷修复先定位根因，再进入可执行计划和逐项验证；根因未明确前不进行推测性并行修改。使用宿主原生 `todo_write`（如果已挂载）记录 `pending`、`in_progress`、`completed`，每次更新完整列表。
- **执行**：一次完成一个就绪任务；先定位与测试，再修改、验证、检查差异；只有确实通过验收才标记完成。新证据推翻原计划时更新剩余步骤，不盲目重试。
- **复核**：有原生子 Agent 时，可以将独立审查交给不同 Agent；否则明确使用同一 Agent 自审，不声称完成了独立复核。PR 和合并继续由既有 CI 门禁把关。
- **权限**：规划不等于授权修改文件、执行命令、远程推送或发布；所有危险操作仍经过 DSH 原生权限边界。

该方案只调整现有编程 Skills 的策略，不新增工具名称、模型调用、持久化数据库或 MCP 服务。宿主未提供 `todo_write` 时使用对话内计划，不假装任务已被持久化。

### 文件服务权限与覆盖保护

本地兼容写盘路径在支持的平台使用 `O_NOFOLLOW` 打开目标文件，拒绝在检查与打开之间被换成的最终路径符号链接。不支持该标志的平台保留原有路径预检。此措施**不能消除父目录并发替换的 TOCTOU 风险**，不保证跨文件事务原子性；宿主 FS 已挂载时仍交由 DSH 宿主执行与授权。


- 当 DSH 已注入文件服务但缺少 `resolve`、`readText` 或 `writeText` 时，Delta Code 明确失败，不会退回本地 Node 文件系统；没有注入 FS 服务的兼容路径保持原有真实路径沙箱检查。
- 在 `code_multi_edit` 中设置 `preflight: true` 时，整文件覆盖编辑可以提供 `expectedSha256`（**原文件 UTF-8 内容的 64 位小写 SHA-256**）。预检阶段校验文件版本，写入前再次核对原内容；不匹配则拒绝写入并停止后续编辑。
- `expectedSha256` 仅支持 `content` 覆盖模式并且要求 `preflight: true`；不提供该参数时沿用原有行为。该检查不保证原子性，也不能消除两次检查与写盘间的并发竞态。

- `dryRun: true` 现在无论是否显式设置 `preflight`，都会只读校验整批目标路径、宿主文件服务能力、编辑参数和重复目标；若有任一无效项，所有预演结果均显示未通过，且不写盘。实际编辑未开启 `preflight` 时仍按原有逐项处理方式执行。

### 连续工程验证

`code_verify` 与 `code_verify_suite` 在挂载 DSH Host FS 时，预检项目文件后还会通过相同的宿主工作区校验取得 `processPath`，并将该路径传给 Host subprocess。插件本地路径仅用于识别工作区范围，不作为 Host 执行目录；Host FS 缺失必要能力、拒绝目录元数据或返回无效进程路径时，不执行脚本，也不退回本地文件系统。未挂载 Host FS 的旧兼容路径继续使用真实路径检查。真实 DSH 环境验收仍留待集中执行。


预检项目清单、锁文件和脚本声明时，已挂载 DSH Host FS 的环境仅使用宿主 `resolve/contains/stat/readText`：宿主拒绝、符号链接越界或接口不完整都直接失败，不回退 Node 本地读取。未挂载 Host FS 的旧环境保留本地真实路径校验。这一限制同时适用于 `code_verify` 与 `code_verify_suite`。


对复杂任务可调用 `code_verify_suite`，例如 `scripts: ["typecheck", "test", "build"]`。检查必须是工作区中已声明或预置的项目验证命令；先验证**整个清单**，再按指定顺序通过 DSH Host subprocess 执行，任一检查失败、超时、输出不完整或被宿主拒绝则停止，后续项标记为未执行。每项输出均保留脱敏和长度限制。最多 5 项且不得重复。

权限仍由 `execution.allowCommands` 控制；不会新增 shell 命令入口或绕过 DSH 审批。原有 `code_verify` 接口不变。

### LSP 探测与宿主路径权限

`code_lsp_probe` 在 DSH Host FS 已挂载时，沿用 `resolveAuthorizedGitCwd` 目录校验并获取 `processPath`，不使用 Node `realpath` 读取宿主虚拟路径。目录越界、非目录、缺失接口或授权拒绝会阻断探测；Host FS 存在但宿主 subprocess 不可用时，不回退本地进程。未挂载 Host FS 时保留原有真实路径越界检查。该功能仍需要真实 DSH Host 集成验收。

### 工程概况与宿主文件服务

当 DeepSeek Harness 已注入 `fs` 服务时，`code_project_profile` 仅通过该 Host FS 的 `resolve`、`contains`、`stat` 和 `readText` 识别项目文件与脚本；宿主拒绝访问或缺少必需能力会明确失败，**不会退回 Node 本地读取**。没有 Host FS 的旧兼容路径保持原有行为。工具只输出文件名和脚本名，不输出脚本定义或文件正文。

### Modern Web Guidance 按需只读查询

针对实质性浏览器 UI、HTML/CSS、弹窗、响应式、无障碍与 Web 性能任务，自动路由仅提示可选的 `code_modern_web_guidance`：`action=search` 在插件内固定指南索引中查找，不向外部发送任务文本；`action=retrieve` 只读取 GoogleChrome/modern-web-guidance 在固定 Commit `2b4aa13a72dd47cd135b06ce5abfccd92e19b24f` 的受审查文档，按 Git Blob SHA 和字节长度核验，正文按 12,000 字符分块。遵循 Apache-2.0 许可证；更新指南需要代码审查、重新固定 Commit 和哈希。与用户任务无关的后端、CI 和简单文案修改不提示调用；明确禁止外部 Skill、联网或资料调用时不得绕过要求。

本功能**不执行**上游 Skill 所建议的 `npx @latest`、npm 安装、`legacy-scan`，不启用其 CLI 遥测，不上传项目代码、搜索词或文件内容。网络不可用、Host 拒绝或校验失败时如实报告并使用现有工程检查继续；指南内容属于不可信参考资料，不能修改用户规则、宿主权限或浏览器兼容性要求。每个任务仅主动提示一次，推荐检索一项主题、最多读取两份匹配指南；不是必需的任务门禁。

### Coding Checkpoint 与上下文压缩恢复

保留 Harness 原生 CompactionEngine、`compaction/summary` 日志、Todo 投影与 Git 权限，不新建压缩服务或第二份任务数据库。`code_execution_next` 输出 `contextIntentEvidence`（`anchored` / `incomplete` / `unavailable`），并结合原生摘要水位和 Todo 写入事件次序建议下一步：压缩后缺少完整原始用户来源时返回 `blocked`；用户来源已锚定但原生 Todo 尚未更新时返回 `reconcile`。原生 Todo 已更新仅表示可继续检查，**不表示**用户约束、代码差异、测试或交付已被自动验证。

当单条用户消息被截断到最后 16,384 字符时，或宿主在无此前任务来源的情况下收到“继续”，`code_task_spec.sourceHistoryComplete=false`、`readyForPlanning=false`。只能从真实 Host 会话恢复用户原文，或请用户确认缺失要求；不能依靠模型摘要猜测、跳过禁令或重复写入。缺少原生压缩水位时不得伪称已发生或已验证压缩。真正的 Coding 专用摘要后端需另行进行真实 Harness 接口兼容性与任务结果对照后再决定。

### 空 Git 仓库的任务续接

`code_resume` 在获得 DSH Host Git 的只读证据后，支持刚初始化且未产生首个提交的 Git 仓库。必须确认原生 Todo、`symbolic-ref HEAD`、`status --porcelain=v1 --branch -z` 和再次读取后的状态一致，才能返回 `reconcile`。不伪造 HEAD、不直接返回 `resume` 或交付通过，旧检查点有明确 `expectedHead` 时仍阻断。宿主拒绝、Git 状态漂移或历史来源不完整时保留原有阻断行为。
