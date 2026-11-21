# 更新日志

## [Unreleased]

- 新增: Delta Desktop 独立 portable 发布清单、轻量构建入口和交付 ZIP/TGZ 验证器；实际发布仍要求中央签名 CI 和人工确认版本。

- 新增: Delta Desktop 作为与 Delta Suite、Delta Code 平级的独立 DeepSeek Harness 插件包加入同一仓库，提供 API-first Root Shell 和基础会话交互实验；默认保留官方 UI，B2 原生 UI 裁剪与回退仍待实机验证。

- 修复: Delta Code 多文件 Skill 的不可变审核、中央 CI 准入和运行时加载统一拒绝未显式审查的附属文档与脚本依赖，并对齐 96 KiB 整包上限，避免虚假准入和无法加载。

- 新增: Delta Code 将无脚本、免费、低风险的 Markdown Skill 附属文件纳入不可变整包审查；通过两阶段 PR 和中央 CI 认证后，将引用哈希写入可信目录，原生 Skill Provider 按需加载时重新核对各文件 Blob SHA，保持取消与权限边界。

- 新增: Delta Code 对同一 Git 提交下最多四个 Markdown Skill 附属文档进行不可变 Blob 与继承许可证检查，输出受限静态证据供后续 CI Bundle 审核；未审查多文件引用继续禁止自动启用，并拒绝脚本、路径穿越和未知依赖。

- 修复: Delta Code 的执行统计与 Skill 反馈只计入退出码、信号、超时及输出完整性已证实的验证结果；缺失或矛盾证据单独计为未确认，防止 passed=true 的自报状态影响技能排序。

- 修复: Delta Code 的公开 Skill 来源许可证识别覆盖任意受限层级的父目录，按最近的有效许可证文件判定；同目录有多个相互竞争的许可证文件时拒绝自动准入，避免误用根目录授权。

- 修复: Delta Code 在 Skill 静态审核中识别无前缀的同目录 Markdown 引用（包括 mini/nano 等参考文件），缺少完整固定版本的依赖审核时不再错误宣称 Skill 自包含并自动准入。

- 修复: Delta Code 的可信 Skill 匹配采用明确的单词边界与声明式上下文条件，防止 react/reaction 等子串误匹配；不再通过写死具体 Skill 名称分流，中文关键词仍正常识别。

- 新增: Delta Code 公共 GitHub Skill 检索、固定版本审核及准入目录统一支持受限的根目录/分类目录 Skill 路径，并优先核验技能最近目录的独立许可证；缺失许可证、付费依赖、未审查引用仍不得自动启用。

- 修复: Delta Code 并行任务路由在采用原生子代理前，通过 Harness 公开 subagents 服务验证准确的当前 Agent、已注册 Provider 与实际可用接口；模型自行声明 nativeSubagents=true 不再视为权限或能力证据，无法确认时保持串行执行。

- 修复: Delta Code 原生 Todo 恢复投影拒绝重复、倒退或非法事件序列号，失序时将检查点标为无效而不采用过期的完成状态，仅在后续有效新事件到达后恢复。

- 修复: Delta Code 并行任务波次规划采用保守的跨平台写入路径归一化，识别大小写与 Unicode 等价路径冲突并改为串行，同时拒绝含控制字符的任务路径，防止误判为安全的原生子代理并行写入。

- 修复: Delta Code 原生会话投影在 Harness 服务撤销、重挂载或异步注册晚到时立即失效旧句柄，防止用已注销的 Host Session Projection 继续恢复任务；卸载时同步停止读取并释放注册资源。

- 修复: Delta Code 原生会话恢复保留 Host Git 明确的不可重试状态，只对退出码已知且可重试的瞬时失败进行有界只读重试；超时、退出状态未知与权限拒绝不再被伪装为 HTTP 503。

- 修复: Delta Code 根据真实原生 Todo 检查点按需提示最终交付验证，防止自报完成和重复门禁调用；MultiEdit 拒绝 NUL 二进制文本操作，并对 Host guarded-intent 写入回读确认，内容不一致时停止后续写入。

- 修复: Delta Code 交付策略拒绝缺失完整检查与任务验收证据的伪成功结果；验证失败分类优先使用实际 Host 退出码、终止信号和输出完整性，不被自报通过状态覆盖。

- 修复: Delta Code 的 Host 能力探测新增 subprocess 与工具注册状态诊断；Git/验证执行统一按退出码、终止信号、超时及输出完整性认定结果，阻止非成功或证据不足的命令被误判为通过。

- 新增: Delta Code `code_capabilities(plan)` 以声明式 `requires` 计算依赖波次、就绪和阻塞状态；`uses` 继续仅作可选参考，依据原生 Host 检查点去重，不添加第二套 Agent 或运行时。

- 维护: Delta Suite 统一中文插件名称、原生设置入口和发布说明中的展示名称，保留现有安装标识与配置。

- 维护: Delta Code 统一插件显示名称、设置入口与发布名称，保留现有包标识和工具接口。

- 新增: Delta Code `code_github_skill_auto_advance` 在核验候选 PR 已合并且当前 HEAD 中央 CI 门禁全部成功后，自动重审固定版本并提交独立目录升级 PR，保留二次 CI 和宿主权限。

- 新增: Delta Code `code_github_skill_auto_stage` 将免费公开 Skill 搜索、固定版本低风险审核和惰性 PR 提交整合为一次 Host 授权调用；中央 CI 后续晋级仍独立执行，未审内容不自动加载。

- 修复: Delta Code 免费外部 Skill 的审批说明区分只读工具审核与中央 CI 自动准入；符合完整免费、安全、来源和 Host 门禁者不默认要求每项人工签字，未实现的自动闭环仍明确标示。

- 新增: Delta Code `code_experience_candidate` 结构化经验候选及不可变 Commit/CI 链接校验；提交证据不冒充真实 CI，通过既有自动审核、中央 CI 与宿主权限边界后才可准入使用，不新增逐项人工审批前提。

- 修复: Delta Code 能力目录增加有界声明校验及输出字段白名单，拒绝无效数组、控制字符、超长内容和非标准结果字段，保持现有 Host 权限与中央测试门禁。

- 修复: Gateway 模型发现限制并发与重复请求；Host 服务重挂载或插件卸载时撤销旧预览，阻止迟到回调继续写入（#280）。

- 修复: Delta Code 路由提示标题改为建议性信息，避免将兼容关键词提示误称为已自动决定的工作流；保持原生 Agent 的语义选择权。

- 修复: 标明 Delta Code 语义能力目录的 Action Worker 中央验收位置及源回归双跑边界，防止把测试文件存在误认为真实 CI 通过。

- 新增: Gateway Effort 预览绑定原生 Session 模型与等级，拒绝过期或正在切换的会话选择（#280）。

- 新增: Delta Code 增加 Host 原生 Agent 可按语义选择的声明式能力目录 `code_capabilities`，校验能力引用/循环与受审核 Skill 名称；自动关键词路由降为兼容提示，不增加第二套 Agent 或权限入口。

- 新增: 按需提供测试强度、诊断充分性与已验证经验候选三项专项 Skill；只使用已有项目测试与授权工具，长期经验仍需可信 Skill PR 和中央 CI 审核。

- 新增: Delta Suite 在 Harness 官方 Models 页扩展区域提供按需 Gateway Reasoning Effort 发现与明确确认应用；Host 侧读取当前凭据、验证修订号和一次性预览令牌，浏览器不接触 API Key（#280）。

- 新增: 通过 Harness 官方 revisioned `remote.settings.mutate` 执行用户明确批准的单模型 Gateway Effort 配置变更，严格校验 Host 修订号、模型/凭据引用及写入结果，不自动发现密钥或接管菜单（#280）。

- 新增: Gateway 模型 Effort 的安全同步预览；仅针对指定 Host 模型检查已选等级、差异与冲突，不自动修改任何原生配置（#280）。

- 修复: 当前 Harness 的 Off 会省略思考参数，不能关闭 Gateway 默认 High；Delta 元数据映射不再向原生选择器提供无法保证的 Off，保留显式协议映射与安全等级（#280）。

- 新增: 基于 Gateway 已认证模型目录的 Reasoning Effort 元数据适配与 Default/Off 协议映射，原生模型标签仅展示宿主公开的等级；不绕过原生选择器（#280）。

- 修复: Delta Suite 代理与视觉配置写入按顺序提交，忽略与保存重叠的过期刷新结果，避免设置被旧状态覆盖。

- 修复: 代理与视觉配置仅在 Host 明确确认后生效；离线时拒绝模拟保存与虚假的视觉引擎成功提示。

- 修复: Delta 会话悬浮信息订阅 Host 公开目录更新，工作区锁定归属变化时立即隐藏会话编号与复制操作（#190）。

- 新增: Delta Suite 在官方会话悬浮扩展插槽展示公开目录的最近更新时间，锁定或删除时隐藏（#190）。

- 修复: 原生 Session 归档统一由 Host 负责；客户端不再重复归档或解除用户、第三方已有归档（#190）。

- 修复: Delta Suite Host 会话锁定、验证、解锁、二次验证初始化和单项/批量删除统一拒绝路径型、原型属性型 Session ID，防止非法目标进入持久化和宿主归档/删除操作（#333）。

- 修复: 删除会话改用官方 Workspace Service，停止直接改写宿主 `workspace.json` 和内部索引（#333）。

- 修复: Harness 官方 `agent/pre-step` 子代理门禁验证每级父会话 Header 的身份与请求父 ID 一致，拒绝错误映射、别名循环及非法标识，防止沿错误祖先链放行模型步骤（#333）。

- 修复: Delta Suite 仅取消自身实际创建并持久化归属的原生会话归档；用户原有归档和缺少归属证据的旧状态在解锁/解绑时保持不变，避免误恢复宿主会话（#333）。

- 修复: 原生会话删除只移除经目录归属与真实路径校验的常规日志文件，不再递归删除包含附件、扩展文件或未知内容的会话目录；仅在目录清空后删除（#333）。

- 修复: 锁定正在运行的会话时使用 Harness 官方 `archiveSession({ stopActivity: true })`，先持久化锁与原生归档，再请求宿主停止活跃任务；归档不可用时保留模型步骤拒绝门禁（#333）。

- 修复: 通过 Harness 正式 `agent/pre-step` 事件，在模型请求开始前拒绝受锁定、已删除墓碑、继承工作区锁及状态不确定的会话（含子代理后代）；原生归档因运行中拒绝时也不再仅依赖 DOM 键盘遮罩（#333）。

- 修复: Host 会话删除仅清理与目标会话别名匹配的原生日志，不再信任客户端目录提示或不匹配的生成记录；打开工作区文件夹必须匹配完整、稳定的宿主公开工作区目录清单（#333）。

- 新增: Delta Suite 使用 Harness 官方会话悬浮卡 Slot 显示授权会话的简短编号和复制操作，保留锁定/墓碑保护、第三方扩展与原生卡片布局（#190、#333）。

- 修复: 为 `dsh-delta-suite` 首个新身份安装测试候选 Beta 更新发布说明和 ZIP/TGZ 内容门禁，拒绝缺少原生会话状态 Slot、兼容状态展示或中英文回退说明的过时安装包（#190、#280、#333）。

- 新增: Delta Suite 设置页显示宿主公开 API 兼容性报告，明确侧栏重排、工作区默认折叠、原生删除守卫与运行文案的原生回退，并说明模型 Reasoning Effort 由 Harness 原生目录与选择器管理（#190、#280）。

- 修复: Delta Suite 原生隐私兼容层在解除菜单/墓碑隐藏时恢复宿主原始 `hidden` 与 `aria-hidden` 状态，避免误显示原本由 Harness 或其他插件隐藏的节点（#333）。

- 修复: 加固 Host 隐私请求路径匹配，阻断 URL 编码、重复分隔符与路径回退造成的遥测接口绕过；保留原始路径保护与无关宿主路由的正常处理（#333）。

- 新增: Delta Suite 通过 Harness 官方 `sidebar.session.row.trailing` Slot 显示会话和继承工作区锁状态，不再恢复原生 DOM 徽章接管；支持官方模式与卸载自动回退（#333、#190）。

- 修复: 移除 Delta Suite 对宿主原生搜索、输入框、预览标题、指南卡与全局样式令牌的私有 CSS 覆盖，保留正式 Theme API 和自有组件样式（#333）。

- 修复: Delta Suite 批量删除会话时按别名集合去重并建立反向索引，避免反复全量比较，保留锁、墓碑及原始取消顺序（#333）。

- 修复: Delta Suite 在多工作区时跳过无用原生菜单扫描，工作区增加后恢复原有隐藏项，未知数量保持保护（#333）。

- 修复: Delta Suite 过滤无关聊天流 DOM 变更，避免反复执行隐私扫描；降低隐藏行重写与搜索重复快照读取（#333）。

- 新增: Delta Suite 在已安装插件详情页提供公开插件包配置入口，与现有设置页共用控制器和偏好状态（#190）。

- 修复: Delta Suite 模型标签 Slot 独立于可选助手侧栏服务挂载；发行校验拒绝缺失设置页或模型标签入口的 ZIP/TGZ（#190）。

- 新增: Delta Suite 通过公开模型标签 Slot 提供 DeepSeek Account 路由名称独立显示偏好，过滤空白与非目标提供方，增加运行时回归测试（#190）。

- 修复: 移除 Harness 原生菜单、Tooltip、Listbox 和私有浮层的 CSS 接管；保留 Delta 自有弹窗与锁屏样式（#333）。

- 修复: Host 工作区清单遇到重复路径、无效成员或失效迁移目标时禁止会话恢复与危险操作，补充授权回归测试（#333）。

- 修复: Delta Code 远程 Skill Provider 在 Agent 销毁后拒绝迟到的 list/get 和 inbox 消息，防止 Host 异步请求重建已结束的任务；保留其他 Agent 与原生 Provider 生命周期隔离，补充 Cordis 真实事件回归。

- 维护: Delta Code 增加基于真实 Cordis Context 装载插件的双 Agent Skill 生命周期集成验收，验证按需读取、任务切换、用户禁用、Agent 释放、Host Skills 服务撤销与重新挂载时的隔离及清理；不访问真实外部 Skill 或付费 API。

- 修复: 原生工作区快照缺失成员、重复路径或迁移目标异常时拒绝危险操作，补充执行测试（#333）。

- 修复: Delta Code 的免费 Skill 候选与可信目录 PR 写入逐步核验目标仓库、Token 归属、Commit/分支回执及 GitHub PR 地址；提交前预读并在固定分支快照复验 CHANGELOG，检测到过期状态或跨账号回执立即中止。

- 修复: 退役 Harness 原生“未分组”右键劫持和合成删除菜单，保留 Host 删除服务、权限拒绝与历史状态（#333）。

- 新增: Delta Code 可从已合并的免费 Skill 候选清单生成独立的可信目录升级 PR，匿名重新审核固定源码与许可证，生成只读权限证据、目录版本变更并沿用中央 CI 门禁；PR 合并之前不激活。

- 新增: Delta Code 可信 GitHub Skill 目录增加独立 CI 准入门禁；新增条目必须有候选清单及完整固定源码/许可证证据，验证 Git Blob SHA、免费与静态风险、只读权限和目录版本，不满足条件直接阻止 CI 合并。

- 修复: 移除 Harness 原生侧栏列表、会话行、滚动条及渐隐提示的私有 CSS；保留 Delta 锁屏与墓碑保护（#333）。

- 新增: Delta Code 可在匿名固定版本免费 Skill 审核后，通过已授权的目标仓库 GitHub Token 自动创建待 CI 审核的不可执行候选清单 PR；验证 GitHub 归属与写入门禁，不自动把候选注册为可信 Skill。

- 修复: 移除将 Harness 原生侧栏开关移出视口及隐藏品牌行的私有 CSS；保留 Delta 公开品牌 Slot 样式（#333）。

- 新增: Delta Code 支持无 Token 的跨组织公开 GitHub Skill 静态审核，重新验证固定 Commit、Git Tree、Skill/许可证 Blob，检查免费使用依据和潜在风险；审核结果不自动提升信任或执行权限。

- 修复: 删除 65 个无效的 `data-delta-compat` CSS 分支及 11 条死规则；保留 Delta 样式，强化 ZIP3 校验（#333）。

- 修复: Delta Code 仅输出有固定版本免费许可证及无付费前提证据的 GitHub Skill 候选；明确收费、订阅与成本未知的外部 Skill 不进入推荐，已审核 Skill 加载入口再次检查，原生工具路由默认排除收费服务。

- 修复: 退役 Harness 中心列、标题、Composer 和轨迹的私有 CSS 布局覆盖；保留 Delta 锁屏与隐私防护（#333）。

- 修复: 退役原生会话/工作区行锁徽章注入与私有 CSS；保留服务侧锁定、墓碑和兼容防护（#333）。

- 新增: Delta Code 支持不使用组织 GitHub Token 的全站公开仓库 Skill 有界发现：验证 Git Tree 中的 SKILL.md、固定 Commit/Blob SHA、按任务匹配与维护证据排序；保持只读、候选未审核、限流停止及用户权限门禁。

- 修复: 移除 Vision 全局粘贴/拖放及私有输入接管；保留 Host Vision 工具与配置，补充发布回归（#333）。

- 新增: GitHub Skill 候选增加 Star/Fork、维护者账号资历与仓库维护活跃度的可解释评分；未知指标不会伪造信誉，结果仅用于排序与复核，不触发自动授权或安装。

- 修复: 移除 Delta 弹窗对 Harness 侧栏颜色的动态改写与全局弹窗打开标记；保留 Delta 自有遮罩和弹窗，补充 ZIP3 审核指纹与回归防护（Issue #333）。

- 修复: Delta Code 的远程 GitHub Skill 加载支持按 Agent 任务切换、明确拒绝和销毁取消未完成请求；按宿主 scope 隔离候选技能与缓存刷新，无 scope 时只使用官方取消信号，保持共享 Provider 与历史会话内容不变。

- 维护: 使用真实 Cordis 插件生命周期集成验证 Delta Code 的技能元数据按需加载、自动路由的用户消息隔离、Provider 注销及不支持生命周期时的关闭行为；明确实机 Harness 子代理/技能验收边界。

- 新增: Delta Code 工作流模式、技能装配和验证指导迁入受审核的声明式规则目录；路由引擎独立保留并行写入、宿主授权和 CI 证据安全门槛，新增全任务/风险矩阵及自定义规则回归测试。

- 新增: Delta Code 把任务关键词、路由优先级和资源指导整理为可扩展的声明式策略，并允许宿主注入受审核规则；保留中英文续接、禁用外部 Skill 和权限隔离等默认行为。

- 修复: Delta Code 的 GitHub Actions 诊断不再写死中央 CI 仓库；从运行或 Job 链接识别实际仓库，严格核对显式参数并使用匹配归属的 Token，防止跨账号误用。

- 修复: Delta Suite 发布校验正确检查 Host 能力兼容导出与实际适配器实现，继续拒绝缺失或错误模块，恢复 ZIP/TGZ 构建验收。

- 修复: 停止扫描和折叠 Harness 原生失败回合错误行，移除相关属性、事件监听及选择器样式，将错误详情布局交还 Host（Issue #333）。

- 修复: Delta Code 技能仅通过可注销的宿主 Provider 按需加载，缺失生命周期能力时关闭对应技能，停止在系统提示词中预先注入完整技能正文（PR #404）。

- 新增: Delta Code 增加性能问题排查、运行时取证、界面视觉一致性检查、Skill 效果评估四类专项工作流技能，扩展中英文任务自动路由及回归测试（PR #403）。

- 修复: Delta Code GitHub 连接按账号或组织隔离 Token，同一归属下仓库数量不限，由 GitHub 验证实际权限；新增 Actions Job 原始日志只读诊断工具，安全处理重定向、脱敏与响应限额（PR #402）。

- 维护: 将已有公开模型标签插槽与独立名称偏好纳入就绪清单和使用说明；Windows 实机验收边界保持明确。

- 维护: 明确能力协商 helper 尚未接入运行时 Host manifest；未公开能力继续回退原生体验（Issue #190）。

- 维护: 记录模型 Effort 接入所需的凭据范围 Host API，以及 Default 与显式 Off 的协议验收边界；现有未验证模型能力保持未交付（Issue #280）。

- 修复: 不再启用旧 `data-delta-compat` 侧栏样式、重排 Settings 导航或扫描无操作菜单；保留 Harness 原生布局/菜单顺序及现有锁定、删除安全路径（Issue #333）。

- 修复: 在官方 Settings 和 Plugins 页面显示“Delta 扩展套件”配置入口，复用原设置页，不修改原生导航（Issue #333）。

- 修复: 恢复 Harness 原生设置行及空“未分组”容器显示，不再按私有类名或文案隐藏；保留锁定、删除及受限命令保护（Issue #333）。

- 修复: 停止向 Harness 原生菜单注入危险色标记及分隔线 CSS，保留 Delta 自有菜单提示和服务层权限保护（Issue #333）。

- 修复: 移除原生工作区菜单内对疑似重复锁定条目的 DOM 删除及全局原生菜单/页脚 Flex 布局和分隔线覆盖；保留锁定、单工作区删除与服务层权限保护，同步 ZIP3 主题/适配器校验和回归（Issue #333）。

- 修复: 退役对 Harness 原生模态窗口的私有面板定位、指针拖动、双击复位和遮罩/面板 CSS 覆写；由宿主管理原生弹窗，保留 Delta 自有 PIN/删除确认弹窗及权限守卫，同步 ZIP3 校验与回归测试（Issue #333）。

- 修复: 退役 Delta 对 Harness 原生会话和工作区悬浮卡的 DOM 扫描、类名注入、鼠标监听与私有布局 CSS 覆写；保留公开悬浮 Slot 及锁定会话访问保护，同步 ZIP3 校验与回归（Issue #333）。

- 修复: 退役 Delta 对 Harness 三栏网格、原生分隔条指针事件、边缘折叠按钮与持久化宽度的私有兼容接管；保留原生布局和拖动，清理对应 CSS，并同步 ZIP3 审核哈希及回归保护（Issue #333）。

- 修复: 停用 Delta 搜索向 Harness 侧栏 DOM 插入搜索框及私有定位/观察逻辑，改由已确认的 `conversation.input.left` 公开 Slot 打开 Search Palette，保留原生搜索和发布完整性校验（Issue #333）。

- 修复: 服务式 Delta 侧栏搜索仅在已识别的 Harness 侧栏滚动区域内挂载；没有直属导航时仅清理插件 UI 并让原生搜索继续工作；过滤无关及 Delta 自有结果区域 DOM 变化，避免重复同步（Issue #333）。

- 修复: 退役原生侧栏搜索输入代理、私有选择器及模拟输入事件，恢复 Harness 搜索入口的可见性；保留服务式 Delta 搜索并同步 ZIP3 校验与回归（Issue #333）。

- 修复: 移除通过 DOM 克隆原生新会话按钮、模拟点击并隐藏原生按钮的兼容逻辑，保留 Harness 原生入口，同步 ZIP3 主题及适配器校验与回归测试（Issue #333）。

- 修复: 移除通过 Harness 私有工作区展开状态及模拟 DOM 点击强制折叠原生工作区的逻辑，缺少公开接口时保持原生行为并更新 ZIP3 发布校验与回归测试（Issue #333）。

- 修复 [breaking, migration]: 插件统一命名为 `dsh-delta-suite`、`Delta 扩展套件` 和 `Delta Suite`，同步源码目录、Cordis 注册名、客户端与 Host 接口、构建校验、发行资产及测试路径；不改变 Harness 原生插件接管边界。
- 修复 [breaking, migration]: 更名后首次加载安全迁移先前 Profile 状态，完整保留会话锁定、删除墓碑与 2FA 配置；导入失败时拒绝以空状态继续运行，并新增源代码命名检查和迁移回归。

- 修复: 原生会话删除现在隔离 Sessions.cancel 与各会话句柄 cancel 的异常；单项删除还会检查原始/session- 等价 ID 的现有句柄，避免某个取消方法报错后遗漏仍在运行的会话（Issue #333）。

- 修复: 批量删除现在按原始/session- 前缀别名合并同一原生会话，避免重复墓碑、日志清理和注册表解绑；仍对请求中的不同会话 ID 形式逐一尝试取消正在运行的会话，并保留各别名 cwd 提示与锁定跳过保护（Issue #333）。

- 修复: 会话逻辑移动、单项删除及批量删除现在统一清理 movedSessions 中等价的原始/session- 别名，防止旧工作区映射残留，同时保留无关和锁定会话的分组（Issue #333）。

- 修复: 会话原始 ID 和 session- 前缀别名现共享锁定状态；验证和解锁识别已有别名并清理全部等价锁记录，原生归档/解归档确认实际归档别名，避免虚假的恢复成功（Issue #333）。

- 修复: Host 单项会话删除拒绝路径分隔、父目录和 NUL 非法 ID；批量删除不再静默丢弃非法成员后继续删除其余成员，整个请求改为先校验再执行。合法空批量为零副作用成功响应（Issue #333）。

- 修复: 会话逻辑移动映射拒绝 __proto__、constructor、toString 等对象原型保留键及非法路径标识；读取旧持久化状态时跳过危险键，保留既有锁定与删除墓碑（Issue #333）。

- 修复: 会话删除时的 session_projcache 清理现在验证真实 DSH_HOME 归属，阻止通过外部目录符号链接或 Windows junction 删除其他目录的同名缓存文件（Issue #333）。

- 修复: 会话日志物理删除在词法路径检查之外，再校验根目录与候选路径解析后的真实位置，防止通过目录符号链接删除 Harness 会话根目录外的文件（Issue #333）。

- 修复: Host state 查询和打开目录路由在插件卸载后与所有写操作一致地拒绝旧请求；迟到的 connection/webServer/workspaceRegistry 注入不再复活已释放接口（Issue #333）。

- 修复: Harness 工作区注册表延迟加载或重挂载时，重放已持久化会话删除墓碑的原生解绑；旧服务回调和插件卸载后不再执行，避免删除会话被原生列表重新挂载（Issue #333）。

- 修复: 会话单删与批删先持久化删除墓碑，再取消会话和清理原生文件/注册表；状态写入失败时不产生破坏性副作用，且删除过程中不尝试解归档（Issue #333）。

- 修复: Delta 会话移动必须通过 Harness 公开工作区列表确认目标 ID 及路径；不存在、缺失、异常或模糊的目标不再落盘为有效分组（Issue #333）。

- 修复: 跨工作区移动仅保存 Delta 映射，停止直接改写、复制或删除 Harness 原生会话日志，持久化失败也不修改原生文件（Issue #333）。

- 修复: Host 锁定、验证绑定、移动及单项或批量删除统一拒绝已删除会话的原始与 session- 别名，防止绕过墓碑保护（Issue #333）。

- 修复: Harness 原生解归档前置事件现在同时拒绝已删除会话及其 session- 别名；Host 搜索、解归档和解锁恢复使用统一的保护判断（Issue #333）。

- 修复: Host 状态接口异常后解除“已同步”标志并允许重试；代理或视觉接口故障不再连带阻塞有效的锁定状态刷新（Issue #333）。

- 修复: 原生工作区删除及解归档守卫须等待完整 Host 锁定状态；不完整刷新或移动、删除回执不得清除既有锁定记录（Issue #333）。

- 修复: 工作区原生目录不再被插件重写 getSnapshot/subscribe；确认的移动及隐藏投影仅用于 Delta 自有界面，保留宿主与第三方插件状态（Issue #333）。

- 修复: Delta Code GitHub 设置接入 Harness 原生页面与凭据服务，支持直接保存和隐藏 Token、账号状态提示、多账号绑定及凭据轮换，避免明文进入插件配置。

- 修复: 上下文助手、优化预览、会话标识和压缩摘要复用已确认内容保护状态；锁定变化撤销旧回调和助手资源引用（Issue #333）。

- 修复: Delta 客户端搜索按已确认保护状态过滤标题、摘要及导航，锁定变化使旧搜索结果失效，存在保护记录时禁用原生全文搜索回退（Issue #333）。

- 修复: Host 全文搜索先读取持久化保护状态，排除锁定工作区、会话别名及已删除记录，并在观察和响应阶段复核权限（Issue #333）。

- 修复: 工作区客户端删除和解归档守卫统一使用原生成员与持久化锁定状态，临时查看授权不等于变更权限，卸载后旧回调失效（Issue #333）。

- 修复: Host 根据公开工作区成员和已确认移动记录保护锁定工作区，阻止未授权移动、删除及原生解归档；成员不可确认时拒绝危险操作（Issue #333）。

- 修复: 通过 Harness 公开解归档前置事件保护直接锁定会话，损坏或不可读的保护状态不再被当作空配置；原生归档结果必须有实际成员状态佐证（Issue #333）。

- 修复: Host 锁定与会话修改请求串行处理，禁止覆盖已配置的二次验证，归档失败如实返回，状态写入成功后才更新缓存（Issue #333）。

- 修复: 会话及工作区锁定、解锁、解绑必须得到宿主明确确认；移除本地模拟成功和原始解归档旁路，客户端归档补偿不擅自停止运行任务（Issue #333）。

- 修复: 工作区兼容投影不再写入或强制刷新原生 Store，仅通知发生变化的兼容订阅；失败回滚与卸载恢复保留宿主方法所有权（Issue #333）。

- 修复: 工作区投影与宿主真实状态分离，减少无效快照重建，归档请求去重，跨工作区移动必须得到宿主明确确认（Issue #333）。

- 修复: 会话目录归还 Harness 原生所有权；Delta 自身过滤已确认删除的会话，删除失败不伪造成功，成功后使用公开目录刷新（Issue #333）。

- 新增: 通过 Harness 公开会话级 InputActions 在明确绑定、空白且可编辑的主会话中插入斜杠指令；不自动发送，拒绝时保留草稿，全局搜索仍为显式复制；阻止迟到命令目录跨会话复用（Issue #333）。

- 修复: Search Palette 不再通过全局编辑器 DOM、原型 setter 或 `execCommand('insertText')` 注入斜杠命令；改为显式复制并由用户粘贴到 Harness 原生输入框，失败时明确提示（Issue #333）。

- 修复: 不再替换 Harness 的会话导航方法；仅观察宿主已确认的唯一 mainView 会话，保留现有锁定保护及兼容层（Issue #333）。

- 修复: Search Palette 不再为未知宿主快捷键调用内部 registry.invoke 或伪造执行上下文；仅展示具有明确执行路由的命令，并避免重复切换侧栏（Issue #333）。

- 修复: Search Palette 不再镜像 Harness 右侧快捷键指南的 DOM 行或模拟点击；保留公开快捷键目录和 Delta 自有操作（Issue #333）。

- 修复: 搜索面板移除按宿主侧栏文本猜测点击插件管理/定时任务导航的逻辑，不再将不可执行的插件目录项展示为可执行命令；原生入口保留（Issue #333）。

- 修复: 搜索命令面板不再根据全局 aria-label 猜测点击 Harness 设置按钮；无公开接口时隐藏不可执行的设置快捷项，保留原生设置入口和 Delta settings.section 扩展（Issue #333）。

- 修复: Delta Suite 删除账号页脚头像、设置、更新、登录按钮的 DOM 代理及宿主菜单静默隐藏，恢复 Harness 原生账号区显示和交互；同步 ZIP3 审核指纹与防回退测试（Issue #333）。

- 修复: Delta Suite 账号菜单不再猜测点击首尾条目；目标无法明确匹配时保留原生菜单供用户操作，避免设置/登录按钮误触其他命令（Issue #333）。

- 修复: Delta Suite 不再在全局捕获 Ctrl/Cmd+K 或 Escape，搜索面板保留输入框 Enter 与局部 Escape，并纠正快捷键提示；恢复 Harness 原生全局快捷键所有权（Issue #333）。

- 修复: 删除 Delta 对原生 ShortcutsService.dispatch/invoke 的私有方法覆盖与恢复补丁，保留搜索面板和现有键盘监听，继续按 P0 分批清理（Issue #333）。

- 修复: 清除对 Harness 原生账号触发器的捕获阶段点击阻断以及失效的静默绕过缓存，保留 Delta 自有页脚操作（Issue #333）。

- 修复: Delta Suite 不再通过 DOM 和主题 CSS 隐藏 Harness 原生 Feedback 菜单入口；保留其余命令与隐私保护策略（Issue #333）。

- 修复: Delta Suite 不再通过宿主 DOM 将“在文件夹显示 / Show in Finder”等原生会话菜单操作改写为“在应用中打开 / Open in app”；保持删除危险态和 ZIP3 审核校验（Issue #333）。

- 修复: 不再重排 Harness 会话右键菜单或注入/隐藏分隔符，清理对应缓存和 CSS，保留危险操作标记（Issue #333）。

- 修复: Delta Suite 不再重排 Harness 会话 Footer 菜单或注入分隔符；保留删除危险态标记和锁定保护（Issue #333）。

- 修复: 停止对 Harness 工作区菜单原生条目和分隔符排序，保留删除与锁定保护；更新 ZIP3 发布哈希与回归测试（Issue #333）。

- 修复: 不再通过 DOM 为 Harness 原生视图选项菜单写入排序、移动菜单项和分隔符；会话/工作区菜单的兼容治理后续独立进行（Issue #333）。

- 修复: Delta Suite 停止通过 DOM 和 ZIP3 CSS 强制隐藏 Harness 原生 More 导航入口；清理缓存并同步客户端/主题哈希与回归（Issue #333）。

- 修复: 移除侧栏原生导航标签和 aria-label 的 DOM 改写，以及不再需要的辅助函数和恢复缓存；保留 More 治理为单独任务（Issue #333）。

- 修复: Delta Suite 设置导航不再改写 Harness 内建设置标签及无障碍文案；保留 Agent 预设布局标记并更新 ZIP3 发布审核指纹（Issue #333）。

- 修复: 停止 Delta Suite 通过宿主 DOM 重命名原生页面标题，保留 Harness 页面文案所有权，更新 ZIP3 审核指纹（Issue #333）。

- 修复: 停止 Delta Suite 使用 DOM 文本节点改写 Harness 原生运行状态，保留原生文案所有权；更新 ZIP3 审核指纹和回归测试（Issue #333）。

- 修复: 删除 Delta Suite 客户端对 Harness Slots 查询与 Locale 服务的私有方法劫持，恢复宿主设置与反馈入口的原生所有权；旧 DOM 状态文案兼容层仍需后续治理，增加回归约束。

- 修复: Delta Suite 会话搜索在停用后拒绝未完成查询回填缓存，并确保观察句柄只释放一次，补齐卸载期间异步竞态回归。

- 维护: Delta Suite 第一阶段拆分功能注册、宿主能力契约和 Host 装配入口，保持原安装身份及公开导出，并增加边界回归。

- 修复: Delta Desktop 宿主能力协商对未知必需能力实行拒绝优先，即使 Host manifest 声称支持也不能误判兼容；增加未来扩展与重复能力负向回归。

- 修复: Delta Desktop 视觉桥接配置和状态接口不再返回 API Key 明文，遮罩回传不会覆盖原密钥；本地凭据状态采用私有权限和原子写入。

- 修复: 可信 GitHub Skills 使用目录版本及 Commit:Blob candidate 标识；撤销 tombstone 阻止旧版本推荐和加载；DSH Provider 卸载取消未完成加载。
- 修复: 补充可信 Skills 新增、升级、撤销流程，明确已进入既有模型上下文的内容无法追溯清除。

- 修复: Delta Desktop Vision Bridge 识别缓存绑定图片 SHA-256、提示词、模型、服务端点及凭据身份，避免等长图片、同路径改写和切换模型时返回错误 OCR；本地文件读取增加 25MB 限制。

- 新增: Delta Desktop 支持工作区 TOTP 锁定和视觉桥接，扩展会话交互、模型识图工具及中英文设置。

- 修复: 合并高频客户端同步并即时重写新增的运行状态文本，避免“深度求索中”短暂闪现。

- 修复: Delta Code 原生 Skills/可信 GitHub Provider 重复注入去重；运行时 Skills 部分注册失败时回滚已登记项，支持注入子作用域清理及幂等卸载。无卸载能力的旧宿主保留兼容并显式警告。

- 新增: Delta Code 增加 GitHub Skill 候选只读检索与固定 Commit 审核工具，使用既有账号权限和 GitHub 传输层；未审核候选不得自动加载，许可证、依赖与安全风险须经单独准入。

- 维护: 移除 Delta Code 离线会话分析的双组对照模式、差值计算及其 CLI 参数，保留单会话观测和常规 CI；更新相关回归测试与真实宿主验收文档。

- 修复: 明确拒绝 GitHub 外部 Skills 的任务不再触发技能发现、自动推荐或加载提示；后续继续保留禁用，新任务恢复正常匹配。

- 修复: 明确继续同一编程任务时保留已加载 Skill 的验证关联；切换到新任务时仍清除旧反馈，避免丢失有效证据或跨任务归因。

- 修复: 同一编程流程中切换独立任务时清理旧 Skill 推荐与资源检索提示；真正的继续指令保留当前任务上下文。

- 新增: 可信 GitHub Skill 目录增加 Anthropic Frontend Design（Apache-2.0）和 Addy Osmani API/Interface Design（MIT），均固定不可变 Commit、文件哈希及许可证，并按任务意图自动匹配。

- 新增: 增加 `code-find-skills` 技能发现流程，复用宿主原生 GitHub/Web 搜索，审核来源、许可证和安全性后才允许固定版本并加入可信目录。

- 新增: 项目概况受控扫描工作区内的上级 AGENTS.md/CLAUDE.md，只发现路径不读取指令内容，保留 Host FS 授权和取消约束。

- 新增: 可信 Skills 使用当前会话内的匿名加载与实际验证结果改善同等适用技能的选择顺序，证据不足时维持原顺序。

- 新增: Delta Code 依据开发任务选择官方版本文档、跨仓库依赖或原生 MCP 工具检索策略，优先复用 Harness Web/GitHub/MCP 能力，缺失时明确报告。

- 修复: 已审核 GitHub Skill 的远程响应改为流式大小限制，即使响应未声明长度也拒绝超量内容。

- 新增: Delta Code 支持按编程任务自动匹配已审核、GitHub 提交及文件哈希固定的外部 Skills，通过 DSH 原生 Provider 按需加载；拒绝未审核脚本及自动安装。

- 修复: 插件热更新装载失败时尝试恢复上一套生效配置，避免瞬时宿主注册故障导致编程工具永久消失。

- 修复: DSH 工具服务拒绝注册时立即失败并回滚已挂载工具，禁止仅记录警告却把部分功能视为成功。

- 维护: 将 GitHub 账号及远端仓库操作留在 Repository 纯功能层，DSH 工具注册与本地 Origin 检测迁至 Adapter，保留 API 和写入保护。

- 维护: 将工作区 Git 文件发现及 Host FS 授权迁至 Adapter，仓库侧保留文件排名、批量查询与扫描限额纯策略和兼容导出。

- 维护: 将受控 Git Worktree 的 DSH Host 授权、创建和安全删除迁至 Adapter，保留仓库侧纯命名策略及旧工具接口。

- 维护: 将 Git 状态与差异查询的 DSH Host 执行迁至 Adapter，保留 Repository 的解析策略、原导出及严格证据拒绝逻辑。

- 维护: 将多文件编辑的 DSH Host FS 写入与恢复执行迁入 Adapter，保留原工具导出与整批预检及版本约束，并将执行模式判定提取为纯策略。

- 维护: 将项目概况的 DSH Host FS 访问与本地文件读取移至 Adapter，Coding 保留纯策略、原导出和权限拒绝行为。

- 维护: 将原生 Todo 恢复的纯状态策略与 DSH 投影及 Git 执行分离，保留原恢复接口与安全约束。

- 维护: 将交付验证工具的 DSH Git 和 Host 执行迁至 Adapter，保留原接口与原生 Todo 验收策略。

- 维护: 将验证工具的 DSH Host 执行和权限逻辑移至 Adapter，Quality 保留纯策略及兼容导出。

- 维护: Delta Code 将验证项目前置检测中的技术栈、包管理器及 Node 脚本声明解析提取为无宿主依赖策略，保留 Host FS 授权和验证执行边界。

- 维护: 将 Git 工作目录的 DSH Host FS 授权和执行路径解析移至 Adapter，保持原导出及拒绝降级行为。

- 维护: 将 Git porcelain 状态解析提取为宿主无关策略，保持原工具导出、严格状态判定和权限边界。

- 维护: 将 LSP 探测的 DSH 命令执行移入 Adapter，保留原工具导出；语言服务器可用性判断沉淀为独立策略。

- 维护: Delta Code 将 Delivery Gate 的 Todo 验收、任务完成判断与结果组装分离成纯策略，Host Git/验证执行仍保留原权限与证据边界，兼容现有 `code_delivery_gate` 接口。

- 维护: 将 `code_host_probe` 的 Cordis 类型及宿主能力探测迁移至 DSH Adapter，Coding 保留兼容导出；不改变诊断结果、权限或执行行为。

- 维护: Delta Code 将项目技术栈、脚本声明及检查建议提取为纯策略模块；DSH Host FS 的读取、权限、取消及路径边界仍由原工具控制，保留工具接口。

- 维护: Delta Code 将 Cordis Context 扩展及 DSH 提示词类型引用从公共配置类型移至 DSH Adapter，保持配置与工具行为不变。

- 维护: Delta Code 将 GitHub 账号/仓库选择及 Git 路径、分支、SHA 校验提取为宿主无关策略模块，保留旧工具接口与既有行为。

- 维护: Delta Code 将 Coding、Quality、Repository 的功能装配入口改为宿主无关的工具契约；由 DSH Adapter 创建工具实例，保留工具名、启停与权限逻辑。

- 维护: Delta Code 将编程路由、Skills 声明与策略装配从 DSH 运行时解耦；事件、Skills 注册与提示词注入全部收敛到 Adapter，保留旧导出及既有路由行为。

- 维护: Delta Code 删除内置 A/B 随机分组、会话事件对照统计与 code_ab_report 工具；自动路由对所有已启用的编码任务一致生效，保留普通执行指标。

- 修复: Delta Code Host FS 新增原生无条件写入契约，Adapter 按明确语义传递省略的 expected 参数及正确 signal 位置；保留旧式覆盖协议，拒绝无授权宿主降级。

- 维护: Delta Code 将文件系统能力、版本保护与安全本地回退迁入统一 Adapter 边界，保持既有运行时导出和文件操作行为。

- 维护: Code Worker 按能力拆分工具；无 subprocess 时仍可使用多文件编辑、项目概况、宿主探测和指定仓库的 GitHub 远程操作。

- 新增: Delta Code GitHub 多账号支持显式 owner/repository 绑定，跨组织仓库可分别选择账号；重复映射拒绝，原有 owner 路由与 Token 环境变量配置兼容。

- 维护: Delta Code 将 subprocess 从全局必需注入改为可选模块级依赖，缺失时保留规划、Skills 和统计能力；服务恢复时重新装载依赖命令的功能，保留原生权限及取消边界。

- 维护: Delta Code 按小内核、稳定适配契约和五类编程模块重构；保留旧工具导出与配置，补齐停用和热重载资源释放，并将 GitHub API 传输与仓库业务逻辑分离。

- 修复: Delta Code Worker 隔离浏览器客户端入口的顶层作用域，防止 Harness 插件组合加载和重复加载时模块注册冲突；发布前检验 ZIP/TGZ 中的注册 ID、入口完整性及一致性。


- 修复: Delta Code Worker 按网关 #402 的结构化失败分类识别混合 429/响应头超时后的禁止自动重试信号；仅阻止对应故障转移耗尽重播，纯 429 仍按 Retry-After 由 DSH 原生机制恢复。

- 修复: Delta Code 内部 A/B 统计按 DSH 原生 tool/result 的 message.source.callId 和 content[0].isError 正确关联错误结果，避免低估工具失败与失败后重复调用；新增真实事件结构回归测试。

- 修复: Delta Desktop 不再自动注册与 Delta Code Worker 重复的网关重试监听；由 Code Worker 统一协调网关冷却与 DSH 原生重试，避免双重拦截。

- 新增: Delta Code 内置会话级自动 A/B 评估，随机分配不注入动态引导及注入动态引导两组；按 DSH 原生事件统计工具调用、错误、重复请求、完成轮次和 Token，只保留聚合指标。

- 修复: Delta Code 尊重网关故障耗尽的等待提示；长冷却阻止 DSH 立即回放整个故障计划，短冷却仅补齐原生决策后剩余等待。

- 修复: Delta Desktop 在 Host 重试入口拦截带长冷却提示的网关回退耗尽错误，避免重复整条请求；其他错误由 DSH 原生重试处理。

- 新增: Delta Code Worker 离线会话分析脚本，统计调用、错误和重复请求，支持新版与历史基线对比，报告不包含原始日志。

- 修复: Delta Code Worker Host Adapter v1 统一 DSH FS 与工作区服务读取、能力状态探测，区分未挂载、已挂载和无法访问；服务调用被拒绝或挂载不完整时禁止不安全的本地回退。

- 新增: Delta Code Worker 只读会话级执行质量统计，聚合自身工具调用、重复请求、失败分类、验证及交付门禁结果；不保存参数、文件内容或 Token，不统计宿主原生工具。

- 新增: Delta Code 的工作区索引支持最多八组关键词在一次授权的 Git 文件枚举内批量检索，集中复用归一化索引并限制总结果数；跨调用重新读取 Git 状态，避免陈旧缓存与权限绕过。

- 新增: Delta Code 的 code_verify_suite 可根据明确提供的变更文件路径选择聚焦验证，保持全部候选脚本的预检与宿主授权；配置或未知范围改动仍执行完整检查，聚焦成功不等同于交付验收。

- 修复: Delta Code 自动路由避免把“全部/整个/跨模块”类范围任务误判为快速小改动；优先定位运行组件与受 Git 跟踪的源文件，复杂任务在宿主支持时主动安排一次独立只读代码审查。

- 修复: Delta Code 的续接检查即使原生 Todo 全部完成也先核验 Git 基线和工作区，禁止将 Todo 状态误报为交付成功；批量编辑预检拒绝歧义匹配，Host 权限拒绝及网关不可重试响应不再盲目重试。

- 新增: Delta Desktop Host 插件采用 MECE 单一职责 Feature Registry，按能力分域注册搜索、会话、隐私、上下文与代理，并提供幂等回收、可选能力降级和必要权限失败回滚。

- 维护: 按 MECE 原则确立 Delta Desktop 六类唯一职责归属、宿主适配边界及可扩展插槽契约，新增持续校验；禁止仅按文件大小机械拆分。

- 修复: 发布校验与已确认的 ZIP3 桌面界面契约对齐，锁定主题和过渡兼容实现指纹，继续拦截未经审核的私有宿主接管及重复搜索实现。

- 维护: 将 Delta Desktop 浏览器端约 190 行纯类型声明独立到 `client-types.d.ts`，区分客户端与 Host 编译范围，不改变 ZIP 界面或运行时行为。

- 修复: Delta Desktop 界面严格以用户最新 ZIP 为准（包含七分类搜索、Ctrl+K、侧栏和弹窗），同时只以独立公开插槽补回上下文助手、MCP、隐私和 Vision 配置；Host 端维持现有安全实现。

- 维护: 移除未使用的插件模板、脚手架生成器、模板发布清单和相关构建测试引用，清除已废弃的 Delta Suite 网关示例和说明，聚焦两个实际插件产品。

- 维护: workspace_map 本地与 Host FS 发现路径复用边界计数、已授权仓库索引和结果组装；Host 根目录列表只读取一次，保留逐仓库的 Host 身份与权限检查。

- 维护: multi-edit 的 preflight / legacy 路径统一纯函数校验与首项字面量替换，同时保留分支独立的 Host FS 授权、TOCTOU 双读、SHA-256、版本写入与回滚约束。

- 维护: 统一六组 Host FS 测试夹具的路径包含判断与上下文能力模拟，并用类型注释、边界测试校验虚拟目标身份和宿主能力缺失。

- 维护: 多个 Delta Code Host subprocess 测试共用可配置的结果与拒绝夹具，减少重复 Mock，保留场景专属的 Host FS 安全断言。

- 维护: Git 状态、差异、Worktree、交付门禁和 GitHub Origin 共用结果校验，统一失败判定并保留 diff 截断语义。

- 维护: 删除全仓无引用的 WCAG 对比度脚本、未使用的异步认证 Cookie 哈希接口及重复的预热调用。
- 维护: 收敛重复的 LSP 默认服务配置与项目画像脚本解析、结果组装，避免本地和 Host 路径逻辑漂移。

- 维护: 清除 Git 已跟踪的 Delta Code 旧 lib 编译产物，中央 CI 拒绝新增跟踪文件并在编译前清空生成目录。

- 维护: Delta Code 验证套件复用单次项目清单与脚本探测，逐脚本保留 Host 目录授权和进程路径一致性校验。

- 修复: Node 子进程超时后先尝试正常终止，宽限期后强制终止并有界收口，避免孤立输出管道导致执行悬挂。

- 新增: Delta Code 交付门禁按显式目录规则检查新增代码语言，修正暂存新增与删除文件的识别。

- 维护: 统一 Delta Code 宿主文件系统能力契约与检查入口，保留权限拒绝时的安全边界。

- 修复: 统一使用 DSH 官方 systemPrompt 类型定义，消除宿主完整依赖环境中的声明冲突。

- 新增: Delta Desktop 按最新 ZIP 统一界面、样式及交互，整合会话搜索、状态和 Host 服务，同时保留已有的隐私、上下文及视觉协议能力。

- 修复: MCP 管理恢复 Harness Desktop Profile 的服务器配置表单；独立讨论采用聊天优先布局，自动上下文压缩状态与结构化摘要改在聊天活动提示中展示。

- 新增: Delta Desktop 支持结构化上下文自动压缩、checkpoint 查看与失败提示、独立上下文助手和引用提问、默认脱敏与视觉桥、MCP 服务器管理、输入优化及 DeepSeek 模型路由开关。

- 修复: Delta Code 真实 DSH 预检默认使用完整 SDK Profile，保留可选 sdk-minimal 兼容检查，并补充验证超时及交付收口宿主验收项。

- 修复: Delta Code 受控恢复须核对回写后文件内容；宿主返回版本但读回失败或不匹配时不再误报恢复成功。

- 修复: Delta Code 多文件编辑隐式预检时支持 expectedSha256，拒绝过期内容哈希并阻断整批写入。

- 修复: Delta Code 配置快照增加循环引用及深度防护；验证工具支持仅限安全命名且在 Node package.json 中声明的 test:unit 等检查脚本。

- 修复: Delta Code Host 验证增加有界超时与取消信号，结果不确定时阻断重试；区分权限、环境、临时故障与测试失败，交付门禁提示具体处置动作。

- 修复: Delta Code 多文件编辑默认整批预检，失败前拒绝写入，保留显式兼容模式与宿主版本保护恢复。

- 修复: Delta Code 优先复用 DSH 原生工具，避免验证门禁与待办循环依赖，并提高长日志指令识别准确性。

- 修复: 会话搜索框左右间距与侧栏其他元素对齐。

- 新增: 会话搜索改用官方风格的居中弹窗，保留 titleBarOverlay 颜色。

- 维护: 将 Delta Desktop v3 插件压缩包存入对应插件目录。

- 新增: Delta Code 交付门禁逐项关联任务验收条件与真实测试证据，规划路由按任务依赖和写入路径冲突安排并行波次，工作树支持非强制安全清理。

- 修复: Delta Code 续接增加原生任务序号校验和只读 Git 临时故障有界重试；批量验证区分失败类型并禁止未知结果盲目重跑。

- 修复: Delta Code 复杂缺陷修复路由补齐根因分析、分步规划与执行流程，避免未经确认的并行修改。

- 修复: Delta Code 交付门禁核对 DSH 原生 Todo 快照，避免未完成或验证期间变更的任务误报已交付。

- 修复 [security]: 基础 Git 与 GitHub origin 检查统一遵守 Host FS 目录权限。

- 修复 [security]: GitHub 文件提交使用非强制快进，PR 创建支持幂等恢复。

- 修复 [security]: 批量编辑拒绝宿主文件别名冲突，写入失败时标记状态未确认。

- 修复 [security]: 工作区仓库发现与工作树创建遵守 DSH Host FS 权限。

- 修复 [security]: LSP 探测遵循 Host FS 授权路径与子进程权限。

- 修复 [security]: 工程概况验证宿主目录类型及取消状态。

- 修复 [security]: 单项及批量验证统一使用 DSH Host FS 授权的执行目录。

- 修复 [security]: Code Worker 的 Git 目录检查统一遵守 DSH Host FS 权限。

- 修复 [security]: Delta Code Worker 严格校验 Git porcelain 状态证据，异常、缺失或不完整记录不能误判为干净工作区，恢复与交付门禁一律安全阻断。

- 新增: Code Worker 通过宿主待办事件投影跨轮恢复，并核对 Git 基线后续接。

- 新增: Delta Code Worker 交付核验与继续任务检查，检查实际 Git 基线和 Host 运行的测试，阻断未完成或失败结果。

- 修复: Code Worker 工具卸载测试同步纳入 Git Worktree 工具，保证注册数量与注销验证一致。

- 修复: Delta Desktop v2 仅使用宿主公开主题变量和插件自有样式，移除私有 DOM 与工作区服务接管，保留主题优化与中英文文案。

- 修复: Code Worker 声明 subprocess 注入，支持工作区内多仓库有界发现和混合关键词检索。

- 新增: Code Worker 一次性 DSH Profile 启动预检脚本与安全回归测试。

- 修复 [security]: Code Worker Windows/macOS 本地读写改用句柄身份复核后操作。

- 修复 [security]: Code Worker 补偿恢复必须验证宿主回传版本，缺失时标记状态未确认。

- 新增: Code Worker 批量编辑支持显式版本保护补偿恢复，失败时报告留存写入。

- 修复 [security]: Code Worker Linux 本地文件读写通过目录句柄锚定父路径。

- 修复 [security]: Code Worker 批量编辑固定预检版本，拒绝并发覆盖。

- 新增: Code Worker 提供显式版本保护型 DSH Host FS 写入协议。

- 修复 [security]: Code Worker 工程验证预检遵循 DSH Host FS，拒绝权限回退。

- 修复: Delta Desktop 侧栏监听器仅在快捷入口文案变化时更新 DOM，防止 MutationObserver 自触发循环，并补充回归测试。

- 修复 [security]: Code Worker 本地写盘使用 O_NOFOLLOW 防止最终符号链接竞态。

- 修复 [security]: Code Worker LSP 探测拦截符号链接越界，及时响应取消。

- 修复 [security]: Code Worker 工程概况读取遵循 DSH Host 文件服务权限。

- 修复: Code Worker 普通批量编辑拒绝冲突字段，保留逐项结果。

- 新增: Code Worker 顺序验证多项检查，失败立即停止。

- 新增: Code Worker 宿主只读能力诊断，支持 DSH 真实运行验收。

- 修复: Code Worker dryRun 执行完整预检，拒绝无效路径和宿主权限。

- 修复 [security]: Code Worker 遇到不完整的 DSH 子进程服务时拒绝本地命令回退。

- 修复 [security]: Code Worker 宿主 FS 能力不完整时禁止本地回退，批量覆盖支持版本校验。

- 修复 [security]: Code Worker 遵守宿主工作区拒绝与索引命令拒绝结果，不再回退本地执行。

- 新增: Code Worker 复用 DSH 任务列表，按计划逐项执行和验证。
- 修复 [security]: Code Worker 本地文件服务回退验证真实路径和最终目标符号链接，拦截工作区外读取与写入。
- 修复: Code Worker Git 状态正确解析重命名文件，并明确报告命令失败或输出截断。
- 修复 [security]: Code Worker 的 LSP 探测和 GitHub Origin 检测在 DSH 宿主拒绝执行时不再回退本地进程。
- 修复 [security]: GitHub 写入保护读取仓库真实默认分支，防止直接提交至自定义主分支。
- 新增: Code Worker 批量编辑支持可选整批预检，预检失败时不写文件。

- 修复: Code Worker 原生自动路由识别“继续推进任务链”等续接指令，保留同一 Agent 工作流。
- 修复 [security]: Code Worker 工程验证结果正确脱敏 GitHub 令牌，并将 LSP 非零退出码判定为不可用。

- 修复: Delta 侧栏不再依赖搜索服务先启动，缺失时保留导航并在就绪后恢复。
- 新增: Delta 会话悬浮内容订阅原生运行状态，停用后解除订阅。

- 修复: Delta Desktop ZIP 校验忽略说明性注释，仍拦截真实危险宿主引用。

- 修复: 移除 Delta Desktop 未完成能力造成的退出码 65 发布阻断，改由发布操作者自主决定发布时机；未完成状态与制品校验保持不变。

- 修复: 搜索取消后不再启动已排队的旧请求，捕获宿主搜索同步异常。

- 修复: Delta 搜索支持键盘结果导航、语言切换刷新与侧栏重挂载清理旧请求。

- 修复: Delta 会话与工作区搜索在宿主重连时拒绝旧快照，并实时显示已确认运行和归档状态。

- 修复: Delta 新会话快捷入口跟随宿主 session/create 授权动态显示和撤销，拒绝越权触发。

- 修复: Delta 搜索拒绝快捷打开已归档或无法验证归档状态的会话，遵守宿主原生保护。

- 新增: Delta 搜索支持工作区名称与原生打开操作；无导航面板时仍可挂载，路径不外露。

- 新增: Delta 设置页显示搜索服务与侧栏挂载状态，便于排查启用后未生效问题。

- 新增: Delta Desktop 加入插件管理、定时任务和新会话快捷入口，保留宿主导航及回退。

- 新增: 仅使用 Harness 现有会话搜索与导航服务，向原生侧栏添加可撤销搜索入口，不模拟 React 输入或搬迁宿主节点。

- 修复: 侧栏原生命令改为等待正式 Layout 服务注入；缺失服务不再把空操作报告为成功。

- 修复: 撤销不稳定的侧栏 DOM 接管，统一发布包能力契约检查；未验收的桌面功能继续阻断发布。

- 修复: 侧栏兼容适配支持延迟挂载原生搜索框，并提供状态诊断。

- 维护: 仓库及全部工作区包从 Apache-2.0 统一切换至 MIT，打包保留各包 LICENSE；第三方许可和既有历史发布不受影响。

- 新增: Delta Desktop 原生侧栏兼容适配，搜索入口移到插件管理上方、开始对话调用宿主原生命令，并按宿主已有视图状态首次折叠工作区。
- 修复: 隐藏会话悬浮卡中的工作目录路径，增加默认工作区客户端删除拦截及停用恢复，保留原生会话和插件操作。

- 修复: Delta 导航间距仅在 Delta 外观生效；切换官方外观或停用插件时撤销根节点主题标记，避免残留样式。

- 新增: Delta Desktop 使用 Harness 原生会话悬浮插槽显示本地化会话编号与复制操作，保留官方时间和运行状态。
- 修复: 切换官方外观时撤销 Delta 侧栏品牌插槽，恢复官方标识；重新选择 Delta 后重新挂载，并增加生命周期测试。

- 维护: 删除旧 dsh-desktop-delta 独立网页/Host 实现，以可扩展的原生 Delta Desktop 插件替换，保留历史发行记录。

- 维护: 原生客户端插件由 dsh-theme-delta 迁移为 dsh-ui-delta，独立插件 ID、包名与发布清单；保留历史发布和手动版本管理。

- 新增: Delta 主题在原生设置页增加独立“个性设置”栏目，支持中英文配色切换及停用恢复。

- 维护: 插件源码统一使用占位版本，移除本地标签驱动发布，版本仅由 Action Worker 手动发布输入确定。

- 修复: Delta 主题启动失败时保留 Harness 原生界面，并延迟挂载可选 UI 服务。

- 新增: 独立 dsh-theme-delta 插件，通过官方主题与布局插槽提供可逆外观和导航增强。

- 新增: Delta Desktop 便携包发布前验证 ZIP 和 TGZ 完整性及插件入口与版本，失败时阻断发布。

- 修复: 兼容 Harness Electron 的 dsh-app 自定义协议桌面启动及 Host WebSocket 桥接，保留失败回退。

- 修复: Delta 桌面首次启动异常时自动回退原生界面，并隔离 Harness 接口。

- 修复: Delta Desktop 默认启动并在失败时回退原生界面。

- 修复: Delta 桌面客户端注册旧 Suite ID 导致 Harness 启动失败，改用独立的无界面注入入口。

- 新增: Delta Desktop 独立界面，迁移原 Suite 包并移除旧 Tauri 桌面项目及发布合同。

- 修复: 统一侧栏导航间距、默认折叠工作区，并隐藏悬浮弹框里的工作目录路径。

- 修复: 独立 Gateway 验证页使用正确的 Session 列表 RPC 参数名。

- 新增: CI 使用真实 Harness 验证 Delta 独立页面、会话流及重连。

- 新增: Delta Suite 独立页面验证提供临时隔离 Harness Profile 一键启动脚本，固定已验证的 beta.1 发布包，不修改日常插件配置。

- 新增: Delta 独立网页支持真实 Host 会话快照观测与本地隔离验收脚本，验证连接、认证及刷新恢复。

- 修复: 对齐 Code Worker 发布清单的更新日志分类与中央发布治理规则，避免 Release Governance 拒绝发布。

- 修复: 独立 Gateway 验证页在插件停用或认证失效时主动关闭连接，并委托未处理的交互请求。

- 新增: Delta Suite 增加默认关闭的独立网页与认证、会话传输验证入口，不改动原生会话和 Agent 内核。

- 新增: Delta Desktop 接入受管发布，独立构建 Windows、Linux、macOS 安装包。

- 维护: 明确配套交付时先发布和安装 dsh-suite-delta，再发布和安装 dsh-desktop-delta。

- 修复: 统一 Delta 套件全页面导航、会话、对话、输入和设置界面的间距与交互；将搜索框放回插件管理上方并复用原生检索。
- 修复: 移除额外的会话文件夹导航及重复浏览面板；新建文件夹并归入改为单次原子事务，保留宿主原生会话列表。

- 修复: 移除独立桌面打包工作流，改用中央 CI 和手动发布。

- 维护: 补充 Windows、Linux、macOS 本机构建和手动发布说明。

- 维护: 增加 Windows、Linux、macOS 安装包构建检查与草稿发布流程。

- 修复: Harness SDK 输出通道关闭后回收进程并清理旧连接，未完成任务仍标为结果未知。

- 修复: 删除左侧额外恢复会话列表，停止搬迁或删除宿主 React 搜索节点，保留原生会话列表的渲染所有权。
- 修复: 设置页与插件页的 Delta 套件名称按场景区分，精简文本框焦点描边及生图表单的重复边框。

- 维护: 记录 Harness Terminal Controller 的公开 API、SDK stdio 传输缺口及终端进程权限边界。

- 新增: 在连接设置中说明 Harness 设置和敏感凭据暂不可用，并标明 Provider/模型仅在重新连接时应用。

- 新增: 在技能库中区分插件与 Skills，并说明当前 SDK stdio 的目录与管理接口缺口。

- 新增: 本机工作区受限只读浏览与文本预览，保留 Harness 工作目录查询。

- 新增: 读取 Harness 已加载会话实际工作目录，明确工作区与文件接口缺口。

- 维护: 记录单次运行取消的公开 API、竞态边界与 SDK 传输缺口。

- 维护: 记录 Harness 会话目录公开 API 与 SDK stdio 传输缺口及上游接口提案。

- 修复: 切换会话时保留各会话的待完成运行状态。

- 修复: 并发发送时按会话计数等待任务完成。

- 新增: 等待根 Agent 与受管子 Agent 完成后再结束运行状态。

- 维护: 明确 Delta 使用官方 SDK profile 无 Web GUI 运行。

- 新增: Desktop Host v1.1 协议、能力协商及事件缺口提醒。

- 新增: 桌面端历史记录支持确认后删除本机 Delta 对话目录和消息；删除当前对话时切换空对话，存储失败尝试回滚并提示，不影响 Harness 会话。

- 新增: 支持导入和导出 Delta 本机对话备份。
- 修复: 损坏的本机记录不再使桌面界面空白，保存失败时显示提醒。
- 修复: Harness 断线后结束等待状态，并标记未完成工具的结果未知。
- 新增: 新增 Tauri 2 桌面前端 dsh-desktop-delta，与 dsh-suite-delta 并行。
- 修复 [security]: Delta Suite 默认禁用 Session Log 上传入口及其设置开关，关闭可选遥测和插件清单上传，并增加对外发送文本的隐私预检查。
- 新增: Code Worker 按编程请求自动选择工作流，支持手动关闭自动路由。
- 新增: Code Worker 内置设计、测试、编码、审查和持续集成修复技能。
- 新增: 工程验证支持 Node、Rust、Python、Go，保留命令白名单和审批。
- 新增: 会话文件夹支持新建、重命名、删除、排序和本地持久化。
- 新增: 通过宿主公开插槽提供文件夹浏览、拖放和键盘归类。
- 新增: 文件夹归属失效时提供预览和人工确认清理。
- 新增: 会话正文和工具结果可搜索，支持中文子串匹配。
- 新增: 权限审批支持会话内同参数授权复用，不跨会话继承。
- 新增: 网关保护提供推理队列、会话亲和提示及有界重试。
- 新增: 增加真实宿主的键盘、响应式与无障碍验收脚本。
- 新增: 本地视觉基线与多窗口宽度截图校验，不上传私人会话图像。
- 修复 [breaking, security, migration]: GitHub 凭据只保存环境变量名，不再保存明文令牌。
- 修复: 文件夹跨进程写入使用独占锁和版本检查，拒绝过期覆盖。
- 修复: 异常遗留锁仅在确认原进程退出后恢复，未知状态拒绝抢占。
- 修复: 多入口共用文件夹状态和写入队列，防止旧请求覆盖新数据。
- 修复: 重复或无效的文件夹操作不再改动修订版本。
- 修复: 删除会话后清除文件夹归属，准确报告清理异常。
- 修复: 原生侧栏会话列表异常消失时提供非侵入式恢复入口。
- 修复: 文件夹操作按钮具备可区分的辅助阅读名称及键盘焦点。
- 修复: 解决减少动效、高对比度与窄窗口下的样式冲突。
- 修复: 视觉模型已声明图片能力时不再误报不支持图片。
- 修复: 配置文件采用原子写入，并备份不可解析的旧数据。
- 修复: 搜索源返回空结果时继续尝试其他已授权来源。
- 修复: 网关明确不可重试错误或输出中断时不自动重复请求。
- 修复: 修正 Code Worker 批量编辑、空查找和 Git 分支计数边界。
- 修复: 中央通知桥接区分授权失败与限流，并输出脱敏诊断。
- 修复: 修复主题阴影令牌缺失、拖放残留高亮和重复焦点样式。
- 维护: Delta Suite 改用 Apache-2.0 许可，旧版既有许可不变。
- 维护: 界面统一语义组件和主题令牌，保留浅色及深色品牌色。
- 维护: 精简重复样式、文件夹缓存与事件监听，保留宿主扩展接口。
- 维护: 更新文件夹、搜索、会话删除及隐私设置说明。
- 维护: Code Worker 显示名称统一为“Delta 编程助手”。

- 维护: 对齐 Delta Desktop README、兼容性说明与 feature-readiness.json，明确缺少公开扩展契约的功能保持未交付。

- 修复: Delta Code 同步宿主会话沙箱策略，兼容换行匹配，准确传播批量编辑失败，支持授权绝对路径和多模块项目识别。

## [0.1.0-beta.1](https://github.com/fongap-labs/dsh-plugin/releases/tag/dsh-suite-delta-v0.1.0-beta.1) - 2026-11-03

### 新增

- 为 Code Worker 增加原生插件配置界面，支持 GitHub 多账号、工作区、执行权限及语言服务器设置。
- Delta UI 复用 Harness 上下文计量、原生压缩命令与跨会话引用入口。
- 本地 SQLite 长期记忆、全局／项目／会话范围、来源追溯、记忆编辑删除与 JSON 备份导入。
- Agent 按需记忆搜索和授权写入、FTS5 检索与中文子字符串匹配。
- Delta Suite 在本地 Python ddgs 兜底不可用时，按需检测缺少 Python 或 ddgs 的情况，并在搜索失败提示中提供安装指引。
- 集成自定义搜索优先、公共 SearXNG 节点其次、Python ddgs 最终兜底的搜索调度。
- 三个公共 SearXNG 搜索源及失败冷却、响应上限和自定义搜索回退授权控制。
- 记忆备份恢复、重复导入和决策冲突的回归测试。
- Delta UI 支持有限多查询深度检索、去重排序和部分结果保留。
- Delta 套件技能管理支持从 GitHub 链接或 ZIP 文件安全预览 SKILL.md，需用户审核后确认创建，不会直接执行外部脚本。
- Delta 自建技能更新时保留最近十个历史版本，支持查看版本历史与恢复。
- Delta Suite 集成 Harness 原生技能目录，展示技能来源、提供方及状态诊断。
- 在 Delta 套件设置页管理 Delta 自建用户技能，支持创建、编辑、启用、禁用、删除及 SKILL.md 导入预览；宿主、项目与第三方技能保持只读。

### 变更

- DeepSeek 自带模型默认显示；Delta 配置改为默认关闭的“关闭 DeepSeek 自带模型”开关，避免旧版选项语义反转。
- 增加头像事件隔离、设置导航文案及模型默认显示的回归检查。
- Agent 自动写入默认关闭，服务端拒绝未启用时的自动保存。
- 不新增安装界面、不自动安装依赖，沿用自定义 Provider、公共搜索节点和 ddgs 的搜索优先级。
- 开启 SQLite secure_delete，增强本地删除记录的数据残留保护。
- 扩展搜索结果数量并增加本地 Python 搜索依赖检测。
- [breaking, migration] 将 Delta UI 更名为 Delta Suite（Delta 套件），统一 npm 包名及发布标识，并单独改用 MIT 许可证；升级需要安装新包，历史版本保留。

### 修复

- GitHub 凭据不在配置页面回显，配置保存保留已有令牌并限制敏感字段的读取。
- 将侧栏账户头像调整为仅展示，保留设置及登录/退出登录按钮的独立交互与宿主确认流程。
- 将设置导航中的“账户与余额”改为“账户详情”，兼容嵌套文本节点而不破坏原有图标及事件。
- 过期与冲突决策过滤，阻断常见密钥、密码与私钥存储。
- 深度研究支持长文章分段、来源引用及跨来源重复内容标记，避免把相同文字误称为独立核实。
- Delta 长期记忆备份超过单次导入限制时，浏览器自动按 200 条及请求大小分批恢复。
- 导入旧记忆时保留现有有效的同名概念决策，避免备份回滚覆盖新记录。
- 修正联网搜索设置中的过期搜索引擎说明。

### 安全

- [security] 限制远程来源、压缩包体积及内容解析，拒绝路径穿越、符号链接与压缩异常数据。
- [security] 技能文件操作限定于受控用户目录，防止覆盖现有非 Delta 管理的技能。

## [0.1.0-beta.2](https://github.com/fongap-labs/dsh-plugin/releases/tag/dsh-code-worker-v0.1.0-beta.2) - 2026-11-02

### 变更

- 编程插件采用 Linux portable 构建流程，独立提供 zip 与 tgz 安装产物。

### 修复

- 取消 Code Worker 对宿主工具包的精确运行时版本绑定，避免 Harness 候选版本误判插件不兼容。

## [0.1.0-beta.10](https://github.com/fongap-labs/dsh-plugin/releases/tag/dsh-ui-delta-v0.1.0-beta.10) - 2026-11-02

### 新增

- 为插件模板提供一键生成器，自动同步包名、Cordis 标识、构建包装脚本、本地化信息和 Action Worker 发布清单，拒绝重复或非法名称。

### 变更

- 插件模板改用宿主原生工具服务，避免新插件再次引入精确版本耦合。
- 将插件模板的配置与演示工具拆分为独立 Host 模块，默认不注入示例提示词，统一注册与卸载清理，并允许新建插件使用通用构建脚本。

### 修复

- 取消编程插件不必要的工具运行时版本绑定，使宿主更新候选版本时不会因精确依赖声明被误判为不兼容。
- Delta UI 的模型联网搜索与手动搜索统一使用 Python ddgs 执行免密钥检索，优先使用 DuckDuckGo 并保留库内自动后备引擎；移除旧版网页解析搜索逻辑，补充依赖缺失提示及安装说明。
- 恢复 Delta UI 设置、登录和登出的按钮响应，避免头像事件拦截阻断宿主账户菜单；当宿主设置无法打开时显示插件内置设置面板与诊断信息。

## [0.1.0-beta.1](https://github.com/fongap-labs/dsh-plugin/releases/tag/dsh-code-worker-v0.1.0-beta.1) - 2026-11-02

### 新增

- 编程插件支持按仓库所有者自动选择多个 GitHub 账号令牌，读取远端文件、查询 PR 与 CI，并通过功能分支提交合并请求。
- 集成工作区文件索引、隔离 Git 工作树及可控的项目测试验证工具，不需额外安装编程插件。

### 安全

- [security] GitHub 凭据仅从环境变量读取，缺少映射时拒绝请求，远程写入默认关闭。

## [0.1.0-beta.9](https://github.com/fongap-labs/dsh-plugin/releases/tag/dsh-ui-delta-v0.1.0-beta.9) - 2026-11-02

### 变更

- 头像仅在真实余额就绪时显示提示，点击不再打开原生菜单；会话预览的状态与时间保持在同一行。
- 视觉识别复用主模型账号并保留模型名称、温度和输出长度参数；Delta 配置顶部提供在线生图、预览与下载入口。

### 修复

- 联网搜索不再依赖 Python，支持 Bing 区域跳转并让手动搜索和模型搜索共用配置；搜索结果替换草稿时不再重复插入文字。

## [0.1.0-beta.8](https://github.com/fongap-labs/dsh-plugin/releases/tag/dsh-ui-delta-v0.1.0-beta.8) - 2026-11-02

### 修复

- 让会话菜单服务成为可选依赖，避免旧版 Harness 启动时等待不存在的 contextMenus 服务。

## [0.1.0-beta.7](https://github.com/fongap-labs/dsh-plugin/releases/tag/dsh-ui-delta-v0.1.0-beta.7) - 2026-11-02

### 变更

- 将 Harness web_search 默认路由切换为 Python ddgs，并禁用内置 DeepSeek 搜索 provider。

## [0.1.0-beta.6](https://github.com/fongap-labs/dsh-plugin/releases/tag/dsh-ui-delta-v0.1.0-beta.6) - 2026-11-02

### 修复

- 修复 Delta UI 免密钥搜索回退、会话悬浮布局、账户提示和会话菜单，并为非活动会话提供受保护的删除入口。

## [0.1.0-beta.5](https://github.com/fongap-labs/dsh-plugin/releases/tag/dsh-ui-delta-v0.1.0-beta.5) - 2026-11-02

### 新增

- 联网搜索优先采用 Delta 独立服务商配置，未配置时尝试调用宿主原生搜索，并明确报告无密钥或无可用提供方的错误。
- 登录后在头像悬停或键盘聚焦时显示官方账户余额及赠送余额；不可用时不显示虚假零余额。
- 为宿主的联网搜索增加免密钥 DuckDuckGo 提供方，默认通过原生搜索工具使用，并保留网页安全读取与搜索服务商配置。
- 审批弹窗支持“本次会话允许”，仅在同一会话的同一工具、完全相同参数与审批原因下复用授权，刷新或插件卸载后失效。

### 变更

- 明确模型 API 与搜索 API 的认证独立性，以及会话永久删除缺乏宿主公开事务接口的安全限制。

### 修复

- 修复视觉识别与联网搜索服务商的密钥保存，增加显式保存和失败提示。
- 扩展会话正文搜索范围，调整设置名称及会话状态布局。

### 安全

- [security] 在宿主提供日志上传服务时排除 Delta 会话的官方日志上传贡献，减少非预期传输风险。

## [0.1.0-beta.4](https://github.com/fongap-labs/dsh-plugin/releases/tag/dsh-ui-delta-v0.1.0-beta.4) - 2026-11-02

### 新增

- 登录后在头像旁显示账号余额。
- 在会话搜索中补充中文正文的子串匹配。

### 变更

- 将选中内容与批注组合后带入对话，并保留输入框中的草稿。
- 调整侧栏操作图标、会话提示和后台任务状态的布局。
- 防止图片识别错误提示与侧栏操作重叠。
- 默认隐藏 DeepSeek 自带模型，并支持在 Delta UI 中恢复显示。

### 安全

- [security] 清除或移除搜索服务提供方时同步清理内存中的密钥，避免已撤销的凭据继续被读取。

## [0.1.0-beta.3](https://github.com/fongap-labs/dsh-plugin/releases/tag/dsh-ui-delta-v0.1.0-beta.3) - 2026-11-02

### 修复

- 统一插件、共享库及发布清单的 Apache-2.0 许可证声明，并为独立安装包附带完整许可证文本。
- 默认隐藏 DeepSeek 账号模型和第三方模型入口，调整侧栏搜索、提示与悬浮卡片布局，并确保批注发送时包含选中文本且发送后清除。
- 安装说明回归测试从插件发布清单读取包名与资产名称，不再固定预发布版本号。

## [0.1.0-beta.2](https://github.com/fongap-labs/dsh-plugin/releases/tag/dsh-ui-delta-v0.1.0-beta.2) - 2026-11-02

### 新增

- 发布清单声明 `.tgz` 资产，构建脚本同步打包产出标准 npm tarball 附件，支持在 DeepSeek Harness 通过 Release 资产直链在线安装插件。

### 变更

- 对齐 `dsh-ui-delta` 的 `package.json` 客户端配置，补全 `immediately: true` 与界面服务注入依赖声明，确保 Web 启动即时预加载。
- 将全仓库插件及共享包统一纳入 @fongap-labs 作用域命名空间，声明 private 为 false 并配置 publishConfig.access 为 public，对齐 NPM 公开发布与组织归属规范。

### 修复

- 在 `dsh-ui-delta` 的 `package.json` 中补全 `dsh.client` 元信息声明，声明 `platform: "web"` 以及主题和渲染层服务注入依赖，确保 DeepSeek Harness 能够正确发现并装载前端 UI 视觉与主题模块。
- 强化全仓库插件打包与发布门禁：在 pack-bundles 与发布脚本中强制校验 dsh.client 配置、打包 bundleDependencies 内部依赖并移除 private 标记，保障全插件独立分发可用。
- 消除插件版本误报，并保留原生界面导航、菜单与配置入口。
- 统一会话选中样式及悬浮提示外观，修正插件安装说明与发布资产地址。

## [0.1.0-beta.1](https://github.com/fongap-labs/dsh-plugin/releases/tag/dsh-ui-delta-v0.1.0-beta.1) - 2026-11-01

### 新增

- 增加 DeepSeek harness 插件源码，包括 UI 界面插件、编程插件、共享库与插件模板。
- `.gitattributes` 声明 `packages/.nvmrc` 为文本文件并固定 LF 换行，防止再次出现编码或换行污染。
- 每个 DSH 插件独立发布的 Action Worker `projects/` 布局清单（`projects/dsh-code-worker/release.manifest.json`、`projects/dsh-ui-delta/release.manifest.json`、`projects/plugin-template/release.manifest.json`）。
- 通用构建脚本 `scripts/build-release.ps1` 与各包包装脚本（`packages/*/build-release.ps1`），支持 `-Package`、`-Target`、`-Version`、`-OutputDir` 参数，注入版本 → 安装依赖 → 全量编译 → 仅打包目标插件 → 产出单一 zip → 还原 package.json。
- 发布构建在写出任何产物前打印 `Source revision: <sha>`（`git rev-parse HEAD`）。Action Worker 按固定提交检出源码，workflow_dispatch 的输入在运行创建时即固定，因此一次跑在旧提交上的构建在日志里无法与最新代码区分；有了这一行，日志可以直接对上是哪个提交产出的产物。
- `tests/release-manifest.test.mjs` 把发布清单契约固定为测试（单一布局、`root`/`script` 存在性、rustup target triple、资产名与打包名一致、跨产品 `release_key`/`artifact_name`/资产唯一、`.nvmrc` 纯 ASCII、包内必含 `package.json`）。
- 增加 release.mjs 发布脚本，从 git tag 读取版本号临时注入 package.json 并在发布后还原，日常开发无需手动维护版本号。
- `.github/workflows/ci.yml`，在 `main` 收到 push 时为该提交触发 Action Worker 的中央 CI（`run-central-ci-ref`）。发布治理阶段会用 `gh run list --workflow ci.yml` 查找源仓库在该提交上的 CI 运行；缺少这个 workflow 时命令直接 404，Release Governance 的「Publish governed release」随之中断，产物无法落到 `dsh-plugin` 的 Releases（本次 run #84 即此原因）。

### 变更

- 将 Delta UI 浏览器客户端由手写 JavaScript 迁移到 TypeScript 源码，新增 tsconfig.client.json 与 harness-module.d.ts，构建产物输出到 lib/。
- 将全仓库产品源码从 JavaScript 迁移到 TypeScript，共享库、编程插件、UI 界面插件宿主端与浏览器客户端、脚手架模板均改为 TypeScript 源码并由 tsc 编译输出到 lib/。
- 脚手架模板新增 tsconfig.json，入口改为 src/index.ts，构建产物输出到 lib/ 并同时发布类型声明。
- 迁移后运行时行为、Cordis 生命周期、Host/Browser 协议与安全边界保持不变，无 any 或 @ts-ignore 规避。
- `packages/.nvmrc` 指定 Node 24，供发布清单 `node_version_file` 解析使用。
- 根 `package.json` 新增 `release` / `release:dry-run` 脚本（复用 PR #8 的 `scripts/release.mjs`）。
- 所有插件包 `package.json` 版本统一为占位符 `0.0.0`。
- `scripts/pack-bundles.mjs` 增加 `--package=<name>` 参数，仅校验/打包指定包。
- 包管理器版本探针失败时保留该候选的退出码与首行输出，全部候选都失败时按候选逐条列出（含完整可执行文件路径），避免只报一句“找不到可用的包管理器”而无从判断是缺 pnpm、npm 取不到包，还是 corepack 签名不可用。
- `scripts/build-release.ps1` 按 `pnpm` → `npm exec pnpm@<packageManager 版本>` → `corepack pnpm` 顺序解析包管理器，不再假设 runner 镜像提供 pnpm shim。
- `scripts/build-release.ps1` 的产物资产名改为从目标包 `package.json` 的名称推导，去掉易漂移的硬编码映射表；同时兼容 Windows PowerShell 把原生命令 stderr 当作终止错误的行为。
- 所有插件包 package.json 的 version 改为占位符 0.0.0，版本号统一由 git tag 在发布时决定。
- 包管理器回退链改为逐个候选执行 `--version` 探针，只有应答的候选才会被用于构建，`pnpm`、`npm exec pnpm@<版本>`、`corepack pnpm` 的先后顺序因此是真实生效的而不是名义上的。
- 解析结果在调用前断言为单个字符串且文件存在，同类错误会在解析阶段报出明确路径，而不是在第一次安装时变成无法解读的命令名错误。
- 该 workflow 与已有业务仓库的同名文件保持一致：不检出代码、不执行变更代码、不引用任何 action（因此不涉及 action 固定版本策略），只用一个 `curl` 把 `repository`/`head_sha` 交给 Action Worker 重算事实。

### 修复

- `packages/.nvmrc` 编码由 UTF-16LE（含 BOM）改为纯 ASCII 文本，避免 `actions/setup-node` 将版本号解析为 `??24` 而安装失败。
- 三个发布清单（`projects/*/release.manifest.json`）的 `builds[].target` 由 `windows-x64` 改为合法 rustup target triple `x86_64-pc-windows-msvc`，修复 Action Worker 直接把它传给 `rustup toolchain install --target` 时下载 `rust-std` 失败导致的发布构建中断。
- 打包产物现在始终包含 `package.json`（与 `npm pack` 行为一致），此前注入的发布版本只存在于工作区、不会出现在 zip 中，产物因此没有版本信息。
- `scripts/build-release.ps1` 解析包管理器时把 `Get-Command` 的多个匹配结果当作单个路径，导致发布构建直接失败（`The term 'C:\hostedtoolcache\...\npm.cmd C:\Program Files\nodejs\npm.cmd' is not recognized`）。Windows runner 的 `npm.cmd` 同时存在于 hosted toolcache 与 `C:\Program Files\nodejs`，`$found.Source` 因此是数组，传给调用运算符后被拼成 `"<路径> <路径>"`；现改为逐个候选解析成唯一真实文件路径。













