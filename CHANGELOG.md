# Changelog

## [Unreleased]

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





