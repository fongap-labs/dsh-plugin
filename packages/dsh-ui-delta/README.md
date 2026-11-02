# dsh-ui-delta

DeepSeek Harness UI 界面深度美化与交互体验插件 (Delta UI)。

## 特性
- **现代主题调色板**：适配深色/浅色双模式，高对比、细腻雅致。
- **布局微调**：底部动作条、顶栏任务模式排布、搜索栏贴边等细节优化。
- **组件质感**：现代磨砂半透明弹窗、卡片圆角与层级阴影。

## 隐私与配置

宿主的「在使用官方模型 API 时上传 Session Log」功能默认为开启。为禁止会话日志上传，必须在 DeepSeek Harness 当前配置档案中将 `session-log-deepseek` 的 `enabled` 设置为 `false`，并确认生效。Delta UI 同时在宿主提供 `sessionLogDeepSeek` 服务时注册全局请求排除规则，作为第二层保护；禁用或卸载 Delta UI 后，这层保护不再存在。已经准备的在途请求不会被追溯取消。普通模型推理仍会发送必需的消息内容，关闭 Session Log 不等于完全离线。

视觉识别与联网搜索的服务商配置需要按「保存配置」才会写入宿主。API 密钥在提交成功后从输入框清除。Windows 下使用当前用户的 DPAPI 加密；其他系统当前仅在进程内保存密钥，重启后需要重新输入。

## 更新

当前发行方式是 GitHub Releases 的版本化 `.tgz` 文件，并非插件内的自动更新服务。安装新版本时使用新的完整 Release 地址，确认插件页的版本号，并按宿主环境需要重新加载。当前版本检测路由仅查询本地已安装版本，不会访问 GitHub、下载或替换插件。生产发布由 Action Worker 负责。

## 搜索与账户展示

插件的 `/search 查询词` 功能不是模型调用的 `web_search` 工具：它只把搜索结果填入输入框，等待用户确认和发送。现在优先使用 Delta 配置中的 Tavily 兼容搜索接口；未配置时复用 Harness 原生 `ctx.web` 搜索服务。Delta UI 的 Bundle 默认把宿主 `web_search` 提供方指定为无需密钥的 DuckDuckGo，`web_fetch` 仍使用原生 HTTP 抓取。

**模型密钥不能代替搜索密钥。** Harness 未安装 Delta UI 时默认使用 `deepseek-official` 进行搜索，需单独具备官方认证。安装 Delta UI 的 Bundle 后默认选择 `delta-duckduckgo`，不需要官方搜索 API Key。使用其他模型网关时，建议为宿主指定独立搜索服务商（例如 Exa），或在 Delta 配置中提供 Tavily 兼容接口。若没有可用搜索服务，插件将明确说明配置失败原因；不会伪造新闻。

登录后，头像悬停/键盘聚焦显示 Harness 账户余额与赠送余额。数据只来自宿主的账户快照，未就绪时显示不可用，不执行独立的带密钥请求。余额指的是 DeepSeek 官方账户，不是自定义模型提供商或 AI Gateway 的余额。

## 会话删除的安全边界

Harness 当前 `sessionPersistence` 官方接口提供读取、打开、列表、刷新，并没有受支持的永久删除事务。第三方 `dsh-plugin-session-delete` 通过移除物理目录、缓存、工作区记录与宿主内部生命周期完成删除，但该操作依赖宿主内部实现；不能将它视为官方兼容 API。在没有可验证的一致性删除接口前，Delta UI 不直接执行物理删除。当前请使用 Harness 原生**归档**（可恢复）清理侧栏；切勿把归档称为永久删除。

## 免密钥搜索与原生工具

安装本 Bundle 后，`web.searchProvider` 默认设为 `delta-duckduckgo`，但用户 Profile 中对 `web` 的覆盖配置优先。适配器通过 DuckDuckGo HTML 搜索页获取搜索结果，不需要 API Key；搜索结果可能因限流、地区封锁或网页结构变动而失败，遇到这种情况会报错而不会编造内容。请在宿主代理或网络连接可用的前提下测试。

Delta UI 不再单独注册第二套模型搜索工具，而是向宿主的 `ctx.web` 注册一个 Provider。普通对话的自动搜索取决于所选 Agent preset 是否实际加载 `@deepseek-ai/dsh-tool-web`；网页读取沿用 Harness `web-fetch-http` 的安全规则。Exa、Tavily、Brave 等 API 型服务商仍可按各自 Host 提供方或独立接口配置使用，费用与密钥由服务商决定。

## 本次会话允许

工具审批弹窗增加“本次会话允许”。首次点击仍通过宿主原生 `PendingApproval.answer('allowed-once')` 批准当前请求，以便宿主记录 `approval/asked` 与 `approval/decided`。插件只在**相同浏览器加载周期、同一会话实例、同一个工具、完全相同的原始参数及审批原因**全部相同时，自动批准后续请求。不同命令、文件路径、参数、原因、会话、分支会话不共享授权；调用缺失、历史未就绪或无法确定参数时仍仅提供一次性审批。保留宿主的 `never` 拒绝策略。

授权只在当前 Delta UI 页面内存中持有，刷新页面、卸载插件或宿主连接重新建立后自动失效；**不提供永久允许**，也不把会话授权等同于“对全部操作取消审批”。目前未提供单独的授权列表；如需立即撤销已授权的重复操作，可刷新页面。真实桌面端仍需验证宿主审批区域是否按预期显示第三个按钮。
