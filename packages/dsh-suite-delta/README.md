# Delta Suite（Delta 套件）

DeepSeek Harness UI 界面深度美化与交互体验插件 (Delta Suite)。

## 特性
- **现代主题调色板**：适配深色/浅色双模式，高对比、细腻雅致。
- **布局微调**：底部动作条、顶栏任务模式排布、搜索栏贴边等细节优化。
- **组件质感**：现代磨砂半透明弹窗、卡片圆角与层级阴影。

## 隐私与配置

Delta Suite 的 Bundle 默认将「在使用官方模型 API 时上传 Session Log」设为关闭，即宿主 `session-log-deepseek` 的 `enabled` 为 `false`；需要上传时可在宿主「设置 → 通用」中重新开启。Delta Suite 同时在宿主提供 `sessionLogDeepSeek` 服务时注册全局请求排除规则，作为第二层保护；禁用或卸载 Delta Suite 后，这层保护不再存在。已经准备的在途请求不会被追溯取消。普通模型推理仍会发送必需的消息内容，关闭 Session Log 不等于完全离线。

联网搜索的独立服务商配置需要按「保存配置」才会写入宿主。视觉识别与生图复用「模型配置」中当前默认模型的账号、接口地址和 API Key，不再单独添加视觉服务商；各自可指定模型 ID。API 密钥在提交成功后从输入框清除。Windows 下使用当前用户的 DPAPI 加密；其他系统当前仅在进程内保存密钥，重启后需要重新输入。

## 免费网关可靠性

可选的 `gatewayReliability` 配置为指定网关添加共享推理队列、步骤截止时间、重试上限及 Cloudflare 1102 识别；普通对话和压缩、自动审查共用并发预算。发生局部输出错误时停止自动重放，工具审批仍由宿主负责。默认不启用，配置、宿主接口要求和长上下文调优见仓库的 [免费网关客户端保护指南](../../docs/GATEWAY_RELIABILITY.md)。

## 更新

当前发行方式是 GitHub Releases 的版本化 `.tgz` 文件，并非插件内的自动更新服务。安装新版本时使用新的完整 Release 地址，确认插件页的版本号，并按宿主环境需要重新加载。当前版本检测路由仅查询本地已安装版本，不会访问 GitHub、下载或替换插件。生产发布由 Action Worker 负责。

## 搜索与账户展示

输入 `/search 查询词` 会将搜索结果回填输入框，等待用户确认发送；它不等同于模型调用 `web_search` 工具，但两者复用 Delta 的宿主搜索实现。搜索先使用已配置的独立服务商；允许免密钥搜索时依次尝试公共 SearXNG 节点和本地 Python `ddgs`。**Python 是最终兜底，不是全部搜索方式的前置依赖。** 搜索过程中保留用户草稿，切换输入框或继续编辑不会被过期结果覆盖。

**模型密钥不能代替搜索密钥。** Harness 未安装 Delta Suite 时默认使用 `deepseek-official` 进行搜索，需单独具备官方认证。安装 Delta Suite 的 Bundle 后默认选择 `delta-duckduckgo`，不需要官方搜索 API Key。使用其他模型网关时，建议为宿主指定独立搜索服务商（例如 Exa），或在 Delta 套件中提供 Tavily 兼容接口。若没有可用搜索服务，插件将明确说明配置失败原因；不会伪造新闻。

登录后，头像悬停/键盘聚焦显示 Harness 账户余额与赠送余额。数据只来自宿主的账户快照，未就绪时不显示任何余额提示；宿主提供今日消费数据时，悬停提示会一并显示今日消费金额，缺失时不会显示虚假数值；点击头像不再弹出设置、反馈或退出菜单，不执行独立的带密钥请求。余额指的是 DeepSeek 官方账户，不是自定义模型提供商或 AI Gateway 的余额。

## 会话删除的安全边界

Harness 的 `sessionPersistence` 尚未提供受支持的永久删除事务。Delta Suite 当前**确实提供了实验性的冷会话永久删除**：在会话右键菜单选择「删除会话」并确认后，插件通过 `/dsh-ui-delta/session-delete` 删除对应的持久化会话目录，并尝试解除工作区关联及文件夹归属。正在运行、仍在宿主内存中、存储路径不符合隔离规则或无法安全定位的会话会被拒绝。此操作依赖宿主内部结构，无法保证跨版本兼容或多步骤原子回滚；物理删除不可撤销，若后续清理失败可能留下工作区或文件夹残余记录。**日常整理优先使用 Harness 原生归档**，只有明确需要永久移除冷会话时才使用这一入口。归档不等于删除。

## 会话文件夹

Delta Suite 提供本地文件夹管理、会话归类、独立的文件夹浏览面板和面板内拖放。宿主原生侧栏的工作区树仍由 Harness 管理，插件不会重排其会话节点。文件夹归属使用本地状态文件保存，支持修订版本冲突保护；清理已删除会话的失效归属需要用户先预览、确认。具体边界见[锁恢复说明](docs/folder-lock-recovery.md)和[原生侧栏扩展契约](docs/native-sidebar-grouping-contract.md)。

## 免密钥搜索与原生工具

安装本 Bundle 后，`web.searchProvider` 默认设为 `delta-duckduckgo`，并禁用 Harness 自带的 DeepSeek Messages Search provider 和 Search/Fetch API package，避免它们发起搜索请求。若用户 Profile 显式覆盖了 `web.searchProvider`，需改为 `delta-duckduckgo` 才能使用模型搜索；旧值不会回退调用已禁用的 DeepSeek provider。所有搜索源均不可用时返回明确错误，不会改用 DeepSeek，也不会编造结果。

仅在使用最终的本地 `ddgs` 搜索兜底时需要 Python 3.10+ 和 [`ddgs`](https://pypi.org/project/ddgs/)。Windows 可执行 `py -3 -m pip install ddgs==9.16.1`；macOS/Linux 可执行 `python3 -m pip install ddgs==9.16.1`。可用 `DSH_DDGS_PYTHON` 指定宿主调用的解释器，修改后重启 Harness。插件不会自行安装依赖，也不会静默切换到官方付费搜索。

缺少 Python 或 `ddgs` 时，插件在搜索失败提示中给出安装指引，用户安装后下次搜索可重新尝试。前置的自定义 Provider 和公共 SearXNG 节点均不依赖 Python。

Delta Suite 向宿主的 `ctx.web` 注册搜索 Provider，不另建第二套模型搜索工具。普通对话的自动搜索还取决于所选 Agent preset 是否加载 `@deepseek-ai/dsh-tool-web`；网页读取沿用宿主的 `web-fetch-http` 安全规则。其他搜索服务商的密钥和费用由各自服务商负责。

## 搜索质量与深度检索

默认 `web_search` 保持单次搜索，支持由 Harness 提供的 `maxResults`（最多 20 条）；结果统一过滤非 HTTP(S) 链接、删除常见追踪参数、按 URL 去重并限制摘要长度。Python `ddgs` 的缺失状态通过轻量导入检查进行检测，检查不发出搜索查询。

手动输入 `/search 关键词` 继续执行单次搜索。输入 `/research alpha versus beta` 则使用受控多查询：保留原始查询，按明确的对比或分隔符生成最多两个额外子查询，逐次检索、去重并按关键词相关性排序。研究结果最多保留 15 条；部分查询失败时仍显示已获得的结果，全部失败时明确报错。两种命令只回填编辑框，不自动发送消息。

网页正文通过 Harness 原生 `ctx.web.fetch` 读取，不创建新的联网工具或独立 HTTP 传输栈。针对 /research 的自动读取另外要求公开 HTTPS 域名、DNS 解析为公网地址、禁止 IP 字面量，并对最终 URL 再次校验；每次最多读取 3 个页面、单页最多提取约 6000 字符。可提取标题、常见发布日期元数据和去掉脚本/导航内容的正文。读取失败会明确记录，不能当作已验证事实。由于宿主底层 HTTP Fetch 不绑定本次 DNS 检查的 IP，仍存在极端 DNS 重绑定的剩余风险，生产环境需配合网络出口的内网访问隔离。

独立搜索 Provider 遇到 HTTP 408/425/429/5xx 等暂时性错误后有限重试，再尝试已配置的其他独立 Provider；HTTP 401/403 等认证/权限错误直接返回，不自动换源。若希望独立端点均失败后退回免密钥 ddgs，可在 Delta 联网搜索设置中明确开启（查询会被发往不同服务商），默认关闭。

研究结果提供候选来源、真实网页摘录和可识别的发布日期，而不是自动生成的事实核验结论。跨来源事实冲突仍需模型读取证据并逐一验证。

## 上下文管理与长期记忆（P0–P2）

- **上下文（P0）**：复用 Harness 的 ContextMeter、Token Meter、自动 Compaction、原生 /compact 和 @ 跨会话引用。Delta 设置页提供操作说明，不重写历史，不实现第二套压缩引擎。
- **本地记忆（P1）**：在「设置 → Delta 套件 → 长期记忆」使用本地 SQLite 存储。支持全局／项目／会话范围、类别、来源会话、过期时间、置顶、创建、编辑、删除、搜索和 JSON 备份／导入。数据库路径为 DSH_HOME/delta-memory/memory.sqlite（未指定 DSH_HOME 时使用 ~/.dsh/delta-memory/memory.sqlite）。
- **检索治理（P2）**：SQLite FTS5 加子字符串补充检索，按置顶、匹配与更新时间排序；搜索不返回已过期或已被新决策替代的记录。Agent 使用 delta_memory_search 按需召回，并使用 delta_memory_save 保存可独立理解的事实；每条记忆保留来源。
- **隐私**：Agent 自动写入默认关闭，服务端拒绝未启用时的 Agent 写入；手动管理仍可使用。Agent 召回默认开启，可随时关闭。拦截常见 API Key、密码和私钥文本，记忆仅是不可执行的历史背景。删除单条记忆从 SQLite 表及 FTS 索引中删除，但不追溯删除备份文件。
- **运行时**：记忆需要 Node.js 22.13+（推荐 Node 24），使用内置 node:sqlite，无额外 MCP 或 embedding 服务。旧 Node 仍可使用 Delta Suite 其他功能，记忆接口会给出明确错误。宿主缺少 tools/systemPrompt 时仅 Agent 记忆工具降级。

管理 API：/dsh-ui-delta/memory、/dsh-ui-delta/memory/settings、/dsh-ui-delta/memory/export。备份含记忆正文，需妥善保管。项目 ID 使用 Agent 工作目录 SHA-256 摘要，避免把本地绝对路径存进索引。Agent 在服务端限定为当前项目、当前会话和全局记忆。记忆提取依赖 Agent 主动调用工具，并非每条消息的自动后台处理。

## 视觉识别与在线生图

打开「设置 → Delta 套件」，顶部默认显示「在线生图」。填写生图模型 ID 后保存，输入图片描述、选择尺寸并点击「生成图片」，结果可直接预览和下载。生图只在点击后发起；当前支持返回 Base64 图片的 OpenAI 兼容 Images 接口。GPT Image 模型不发送其不支持的 response_format 参数，参见 [接口说明](https://developers.openai.com/api/reference/resources/images/methods/generate)。仅返回远程图片 URL 的服务会提示不兼容。

开启「视觉识别」后，可设置视觉模型 ID、温度（0–2）及最大输出长度（1–65536 tokens）；参数留空采用服务商默认值。粘贴图片后，识别结果插入输入框。模型 ID 留空跟随主模型；选择的视觉模型必须支持图片输入。原有视觉模型 ID 会保留，旧的独立视觉服务商地址和密钥不再用于请求。

两项功能均复用宿主默认模型所属的 OpenAI 兼容服务商。普通聊天模型不一定支持生图，需要填写该服务商提供的生图模型 ID；密钥始终由宿主读取，配置页面只显示模型信息。生成图片暂存在页面中，离开前请下载。

## 本次会话允许

工具审批弹窗增加“本次会话允许”。首次点击仍通过宿主原生 `PendingApproval.answer('allowed-once')` 批准当前请求，以便宿主记录 `approval/asked` 与 `approval/decided`。插件只在**相同浏览器加载周期、同一会话实例、同一个工具、完全相同的原始参数及审批原因**全部相同时，自动批准后续请求。不同命令、文件路径、参数、原因、会话、分支会话不共享授权；调用缺失、历史未就绪或无法确定参数时仍仅提供一次性审批。保留宿主的 `never` 拒绝策略。

授权只在当前 Delta Suite 页面内存中持有，刷新页面、卸载插件或宿主连接重新建立后自动失效；**不提供永久允许**，也不把会话授权等同于“对全部操作取消审批”。目前未提供单独的授权列表；如需立即撤销已授权的重复操作，可刷新页面。真实桌面端仍需验证宿主审批区域是否按预期显示第三个按钮。


## 集成式搜索与研究链路

无需额外安装独立插件。普通 `web_search` 和 `/search` 复用 Delta Host 搜索实现；`/research` 增加长文章分段和跨来源重复内容标记。

**优先级：自定义 Provider → 内置公共 SearXNG 实例 → 本地 Python ddgs 兜底。**

内置公共实例按顺序尝试 `search.utilibre.org`、`libresearch.space`、`baresearch.org`；失败时自动冷却，无后台轮询，不需要 API Key。公共实例由第三方运维，可能关闭 JSON API、返回访问挑战、限制频率或随时不可用；任何实例失败不得冒充搜索成功。自定义 Provider 的查询默认不转给公共节点，只有在 Delta 设置中明确开启“允许回退到免密钥搜索”时才会切换。认证失败（401/403）不会静默换源。启用回退后，查询可能发往公共实例，请不要用它查询内部机密。

研究路线基于 Harness 原生 Web Fetch，最多尝试 5 个候选网页，保留单页最多约 80,000 字符用于分段，并输出最多 12 段有 URL 的相关证据。跨来源相同语句仅标记“重复陈述”，**不能当作独立的事实核验**。网页抓取有网络风险和内容缺失风险；保留安全 URL 校验、限制正文大小，最终结论仍需验证原始来源。此功能不需额外安装独立插件或服务。

## 技能管理（P0 / P1 基础版）

「设置 → Delta 套件 → 技能管理」直接读取 Harness 原生 `ctx.skills` 目录；已加载技能展示名称、来源、提供方和描述。无法访问宿主注册表时会提示诊断而不会中断对话界面。

Delta 仅管理用户 DSH 目录 `$DSH_HOME/skills`（默认 `~/.dsh/skills`）中由本功能创建的扁平 `<name>.md` 技能。支持创建、编辑、查询、启用、禁用、删除，以及从本机 `SKILL.md` 导入正文到**待审核表单**（必须手动确认后创建）。禁用将文件重命名为 `.md.disabled`，可恢复；不会编辑宿主原生技能、项目技能、第三方技能或直接执行导入的脚本。技能实际加载和发现由 Harness 的 `dsh-skill-filesystem` 负责，必须确认当前 Agent preset 已挂载该服务。

操作限制：名称必须为 kebab-case；描述不得换行；单条正文最多 128 KB。只允许编辑带 Delta 所有权标记的普通文件，拒绝符号链接、覆写现有同名技能和无效操作。外部 SKILL.md 的资源引用、附带脚本和资产不会被安装；不承诺从 GitHub/ZIP 自动安装或自动更新。

## 技能管理扩展：安全导入与回滚

在「设置 → Delta 套件 → 技能管理」可粘贴公开 GitHub 仓库根目录、树目录或 `SKILL.md` 文件的链接，也可以选择本地 ZIP。两种方式只提取并**预览**唯一的 `SKILL.md`，填入待审核表单；必须再次手动点击「创建技能」，不会自动运行脚本或安装 ZIP 内其他资产。GitHub 只接受 `github.com`、`raw.githubusercontent.com` 的 HTTPS 地址，不允许鉴权信息、端口或重定向；浏览器与服务端均限制导入大小。ZIP 最大 2 MB，仅接收一个 `SKILL.md`，拒绝路径穿越、符号链接及异常压缩数据。

Delta 管理技能更新前会保存上一版，最多保留最近 10 个历史版本；可在技能操作栏点击「版本历史」选择恢复，恢复前还会备份当前版本。历史位于 `$DSH_HOME/skills/.delta-skill-history/`，不会复制宿主、项目或第三方技能，且不会执行内容。技能删除目前不自动删除历史快照；它们不会参与 Harness 的技能发现。GitHub 与 ZIP 导入仅支持单个 Markdown 指令文件，不含其引用的 scripts、assets 或 requirements，也不提供自动远程版本检查。

## 许可证与迁移

本插件现使用 [MIT 许可证](LICENSE)，不同于仓库其他包的 Apache-2.0 默认许可证。安装新包 `@fongap-labs/dsh-suite-delta` 前请卸载旧包 `@fongap-labs/dsh-ui-delta`，避免两个插件同时启用。旧 GitHub Release 及其历史标签保留，用于回滚和追溯。配置存储位置、现有 `/dsh-ui-delta/` HTTP 路由、Provider ID 等内部兼容标识暂不调整，以免迁移时丢失数据或破坏已有设置。
