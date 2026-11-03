# dsh-ui-delta

DeepSeek Harness UI 界面深度美化与交互体验插件 (Delta UI)。

## 特性
- **现代主题调色板**：适配深色/浅色双模式，高对比、细腻雅致。
- **布局微调**：底部动作条、顶栏任务模式排布、搜索栏贴边等细节优化。
- **组件质感**：现代磨砂半透明弹窗、卡片圆角与层级阴影。

## 隐私与配置

宿主的「在使用官方模型 API 时上传 Session Log」功能默认为开启。为禁止会话日志上传，必须在 DeepSeek Harness 当前配置档案中将 `session-log-deepseek` 的 `enabled` 设置为 `false`，并确认生效。Delta UI 同时在宿主提供 `sessionLogDeepSeek` 服务时注册全局请求排除规则，作为第二层保护；禁用或卸载 Delta UI 后，这层保护不再存在。已经准备的在途请求不会被追溯取消。普通模型推理仍会发送必需的消息内容，关闭 Session Log 不等于完全离线。

联网搜索的独立服务商配置需要按「保存配置」才会写入宿主。视觉识别与生图复用「模型配置」中当前默认模型的账号、接口地址和 API Key，不再单独添加视觉服务商；各自可指定模型 ID。API 密钥在提交成功后从输入框清除。Windows 下使用当前用户的 DPAPI 加密；其他系统当前仅在进程内保存密钥，重启后需要重新输入。

## 更新

当前发行方式是 GitHub Releases 的版本化 `.tgz` 文件，并非插件内的自动更新服务。安装新版本时使用新的完整 Release 地址，确认插件页的版本号，并按宿主环境需要重新加载。当前版本检测路由仅查询本地已安装版本，不会访问 GitHub、下载或替换插件。生产发布由 Action Worker 负责。

## 搜索与账户展示

插件的 `/search 查询词` 功能不是模型调用的 `web_search` 工具：它只把搜索结果填入输入框，等待用户确认和发送。它与模型的 `web_search` 共用搜索实现：优先使用 Delta 配置中的独立搜索接口；未配置时在宿主本机运行 Python 的 [`ddgs`](https://pypi.org/project/ddgs/) 包，先尝试 DuckDuckGo，失败后由 `ddgs` 自身自动选择其他搜索引擎。无需额外运行 API 或 MCP 服务，但需要安装 Python 3.10+ 和 `ddgs`。搜索过程中保留原草稿，期间编辑或切换输入框不会被异步结果覆盖。网页读取仍使用原生 HTTP 抓取。

**模型密钥不能代替搜索密钥。** Harness 未安装 Delta UI 时默认使用 `deepseek-official` 进行搜索，需单独具备官方认证。安装 Delta UI 的 Bundle 后默认选择 `delta-duckduckgo`，不需要官方搜索 API Key。使用其他模型网关时，建议为宿主指定独立搜索服务商（例如 Exa），或在 Delta 配置中提供 Tavily 兼容接口。若没有可用搜索服务，插件将明确说明配置失败原因；不会伪造新闻。

登录后，头像悬停/键盘聚焦显示 Harness 账户余额与赠送余额。数据只来自宿主的账户快照，未就绪时不显示任何余额提示；点击头像不再弹出设置、反馈或退出菜单，不执行独立的带密钥请求。余额指的是 DeepSeek 官方账户，不是自定义模型提供商或 AI Gateway 的余额。

## 会话删除的安全边界

Harness 当前 `sessionPersistence` 官方接口提供读取、打开、列表、刷新，并没有受支持的永久删除事务。第三方 `dsh-plugin-session-delete` 通过移除物理目录、缓存、工作区记录与宿主内部生命周期完成删除，但该操作依赖宿主内部实现；不能将它视为官方兼容 API。在没有可验证的一致性删除接口前，Delta UI 不直接执行物理删除。当前请使用 Harness 原生**归档**（可恢复）清理侧栏；切勿把归档称为永久删除。

## 免密钥搜索与原生工具

安装本 Bundle 后，`web.searchProvider` 默认设为 `delta-duckduckgo`，并禁用 Harness 自带的 DeepSeek Messages Search provider 和 Search/Fetch API package，避免它们发起搜索请求。若用户 Profile 显式覆盖了 `web.searchProvider`，需改为 `delta-duckduckgo` 才能使用模型搜索；旧值不会回退调用已禁用的 DeepSeek provider。所有搜索源均不可用时返回明确错误，不会改用 DeepSeek，也不会编造结果。

默认搜索依赖宿主进程可调用 Python 3.10+ 和 `ddgs`，并要求 Python 运行环境可访问搜索引擎。Windows 在终端执行 `py -3 -m pip install ddgs==9.16.1`；macOS/Linux 执行 `python3 -m pip install ddgs==9.16.1`。若宿主使用其他 Python 解释器，可设置环境变量 `DSH_DDGS_PYTHON` 为该解释器的完整路径，再重启 Harness。插件不会静默安装第三方依赖，也不会偷偷回退到官方付费搜索。Python 或依赖缺失、网络不可达时，搜索会返回可定位的错误；也可在 Delta 配置中指定独立搜索接口。

Delta UI 不再单独注册第二套模型搜索工具，而是向宿主的 `ctx.web` 注册一个 Provider。普通对话的自动搜索取决于所选 Agent preset 是否实际加载 `@deepseek-ai/dsh-tool-web`；网页读取沿用 Harness `web-fetch-http` 的安全规则。Exa、Tavily、Brave 等 API 型服务商仍可按各自 Host 提供方或独立接口配置使用，费用与密钥由服务商决定。

## 搜索质量与深度检索

默认 `web_search` 保持单次搜索，支持由 Harness 提供的 `maxResults`（最多 20 条）；结果统一过滤非 HTTP(S) 链接、删除常见追踪参数、按 URL 去重并限制摘要长度。Python `ddgs` 的缺失状态通过轻量导入检查进行检测，检查不发出搜索查询。

手动输入 `/search 关键词` 继续执行单次搜索。输入 `/research alpha versus beta` 则使用受控多查询：保留原始查询，按明确的对比或分隔符生成最多两个额外子查询，逐次检索、去重并按关键词相关性排序。研究结果最多保留 15 条；部分查询失败时仍显示已获得的结果，全部失败时明确报错。两种命令只回填编辑框，不自动发送消息。

网页正文通过 Harness 原生 `ctx.web.fetch` 读取，不创建新的联网工具或独立 HTTP 传输栈。针对 /research 的自动读取另外要求公开 HTTPS 域名、DNS 解析为公网地址、禁止 IP 字面量，并对最终 URL 再次校验；每次最多读取 3 个页面、单页最多提取约 6000 字符。可提取标题、常见发布日期元数据和去掉脚本/导航内容的正文。读取失败会明确记录，不能当作已验证事实。由于宿主底层 HTTP Fetch 不绑定本次 DNS 检查的 IP，仍存在极端 DNS 重绑定的剩余风险，生产环境需配合网络出口的内网访问隔离。

独立搜索 Provider 遇到 HTTP 408/425/429/5xx 等暂时性错误后有限重试，再尝试已配置的其他独立 Provider；HTTP 401/403 等认证/权限错误直接返回，不自动换源。若希望独立端点均失败后退回免密钥 ddgs，可在 Delta 联网搜索设置中明确开启（查询会被发往不同服务商），默认关闭。

研究结果提供候选来源、真实网页摘录和可识别的发布日期，而不是自动生成的事实核验结论。跨来源事实冲突仍需模型读取证据并逐一验证。

## 上下文管理与长期记忆（P0–P2）

- **上下文（P0）**：复用 Harness 的 ContextMeter、Token Meter、自动 Compaction、原生 /compact 和 @ 跨会话引用。Delta 设置页提供操作说明，不重写历史，不实现第二套压缩引擎。
- **本地记忆（P1）**：在「设置 → Delta 配置 → 长期记忆」使用本地 SQLite 存储。支持全局／项目／会话范围、类别、来源会话、过期时间、置顶、创建、编辑、删除、搜索和 JSON 备份／导入。数据库路径为 DSH_HOME/delta-memory/memory.sqlite（未指定 DSH_HOME 时使用 ~/.dsh/delta-memory/memory.sqlite）。
- **检索治理（P2）**：SQLite FTS5 加子字符串补充检索，按置顶、匹配与更新时间排序；搜索不返回已过期或已被新决策替代的记录。Agent 使用 delta_memory_search 按需召回，并使用 delta_memory_save 保存可独立理解的事实；每条记忆保留来源。
- **隐私**：Agent 自动写入默认关闭，服务端拒绝未启用时的 Agent 写入；手动管理仍可使用。Agent 召回默认开启，可随时关闭。拦截常见 API Key、密码和私钥文本，记忆仅是不可执行的历史背景。删除单条记忆从 SQLite 表及 FTS 索引中删除，但不追溯删除备份文件。
- **运行时**：记忆需要 Node.js 22.13+（推荐 Node 24），使用内置 node:sqlite，无额外 MCP 或 embedding 服务。旧 Node 仍可使用 Delta UI 其他功能，记忆接口会给出明确错误。宿主缺少 tools/systemPrompt 时仅 Agent 记忆工具降级。

管理 API：/dsh-ui-delta/memory、/dsh-ui-delta/memory/settings、/dsh-ui-delta/memory/export。备份含记忆正文，需妥善保管。项目 ID 使用 Agent 工作目录 SHA-256 摘要，避免把本地绝对路径存进索引。Agent 在服务端限定为当前项目、当前会话和全局记忆。记忆提取依赖 Agent 主动调用工具，并非每条消息的自动后台处理。

## 视觉识别与在线生图

打开「设置 → Delta 配置」，顶部默认显示「在线生图」。填写生图模型 ID 后保存，输入图片描述、选择尺寸并点击「生成图片」，结果可直接预览和下载。生图只在点击后发起；当前支持返回 Base64 图片的 OpenAI 兼容 Images 接口。GPT Image 模型不发送其不支持的 response_format 参数，参见 [接口说明](https://developers.openai.com/api/reference/resources/images/methods/generate)。仅返回远程图片 URL 的服务会提示不兼容。

开启「视觉识别」后，可设置视觉模型 ID、温度（0–2）及最大输出长度（1–65536 tokens）；参数留空采用服务商默认值。粘贴图片后，识别结果插入输入框。模型 ID 留空跟随主模型；选择的视觉模型必须支持图片输入。原有视觉模型 ID 会保留，旧的独立视觉服务商地址和密钥不再用于请求。

两项功能均复用宿主默认模型所属的 OpenAI 兼容服务商。普通聊天模型不一定支持生图，需要填写该服务商提供的生图模型 ID；密钥始终由宿主读取，配置页面只显示模型信息。生成图片暂存在页面中，离开前请下载。

## 本次会话允许

工具审批弹窗增加“本次会话允许”。首次点击仍通过宿主原生 `PendingApproval.answer('allowed-once')` 批准当前请求，以便宿主记录 `approval/asked` 与 `approval/decided`。插件只在**相同浏览器加载周期、同一会话实例、同一个工具、完全相同的原始参数及审批原因**全部相同时，自动批准后续请求。不同命令、文件路径、参数、原因、会话、分支会话不共享授权；调用缺失、历史未就绪或无法确定参数时仍仅提供一次性审批。保留宿主的 `never` 拒绝策略。

授权只在当前 Delta UI 页面内存中持有，刷新页面、卸载插件或宿主连接重新建立后自动失效；**不提供永久允许**，也不把会话授权等同于“对全部操作取消审批”。目前未提供单独的授权列表；如需立即撤销已授权的重复操作，可刷新页面。真实桌面端仍需验证宿主审批区域是否按预期显示第三个按钮。
