# 更新日志

## [Unreleased]

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













