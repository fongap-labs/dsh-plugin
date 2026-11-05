# Delta Suite 桌面架构

## 目标

`dsh-desktop-delta` 是完整桌面前端产品，用户看到的品牌仍为 Delta Suite；DeepSeek Harness 是唯一运行内核。桌面端管理窗口、导航、会话呈现、输入体验和本机集成；Harness 继续拥有 Agent 循环、模型路由、工具执行、审批、会话持久化、工作区状态及插件执行。

Delta 不复制、打包或维护 Harness 内核源码。Delta 的 Tauri 后端从用户指定的位置启动并监督已有 Harness CLI，通过公开 SDK stdio JSON-RPC 连接运行时，再把类型化结果交给 renderer。

桌面连接可以选填一个 Harness profile 配置补丁路径。Tauri 只把该路径作为官方 `--patch` 启动参数传给 Harness；例如要让 Harness 同时加载 `dsh-suite-delta`，用户需先按 Harness 原有方式安装插件，再指定插件提供的 `cordis.patch.yml`。这项设置不会安装插件、改写 Harness 配置或把插件打进桌面包。

## 进程与接口

```text
React renderer
  ↕ DesktopHostPort（产品级 TypeScript 接口）
Tauri host（进程监督与协议适配）
  ↕ Harness 官方 stdio JSON-RPC
DeepSeek Harness runtime（独立安装、独立生命周期）
```

Renderer 不直接启动进程、访问文件系统、读取凭据或解析 Harness 内部数据。Tauri host 不包含 Agent 循环、模型客户端、工具注册、会话存储实现或插件加载器。

## 无 Web GUI 运行方式

Harness 已提供受支持的长期运行 SDK profile，Delta 无需等待新的启动模式。Tauri 通过用户指定的 Node.js 与 Harness CLI 启动：

```sh
dsh --profile sdk
```

该 profile 由 `dsh-base` 与 `dsh-sdk-app` 组合，持续通过 stdin/stdout 提供 JSON-RPC 服务；它不启动 Harness Web Server，也不打开浏览器页面。Delta 自己的窗口仍由 Tauri WebView 渲染，但不加载 Harness 原生 Web UI。

不要把它与 `dsh --profile headless "<task>"` 混为一谈：headless 是单次任务入口，创建一个新会话、输出最终结果后退出，不支持桌面所需的持续交互。当前 Tauri adapter 已使用 `sdk`，不需要切换启动器。

官方依据：[SDK profile](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/bundle/sdk-app/README.md)、[CLI profile 说明](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/cli/README.md)、[headless profile](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/bundle/headless/README.md)。

## Host API 缺口

Harness 的公开 SDK 协议采用 stdio JSON-RPC。当前文档化能力包括初始化、提交提示词、查询、恢复、等待、设置工作目录、审批和用户提问，以及会话事件与状态通知。SDK 使用已有的 session ID，不提供完整桌面所需的会话目录查询，也不提供设置、插件管理、工作区文件列表和终端控制 API。

完整替换原生前端前，Harness 必须提供稳定、可版本协商的桌面 Host API，或扩展现有公开 SDK。Delta adapter 只实现该公开合同。若能力尚不存在，界面明确显示不可用；不得用以下方式绕过：

- 依赖 Harness Web UI 的 DOM、CSS 类名、模块加载器或 UI slot。
- 直接依赖 Harness 的私有 `ctx` 服务、内部 Remote 包或非公开 TypeScript 导出。
- 读取或修改 Harness 私有会话文件、设置文件、SQLite schema 或插件安装目录。
- 在 Delta 包中复制 Harness 的 agent loop、模型路由、审批、工具或存储逻辑。

Host API 应定义协议版本、能力协商、请求取消、超时、事件顺序、错误类型与向后兼容策略。Delta UI 只依赖产品级 DTO；Harness 内部类型由 Harness 自己适配到该合同。目标接口、DTO 与当前 SDK 缺口见 [Desktop Host API v1](HOST_API.md)。

## 原生前端退役

`dsh-suite-delta` 与 `dsh-desktop-delta` 是两个独立、可并行运行的包：前者继续向 Harness 提供现有插件能力，后者提供完整桌面前端。并行运行不要求桌面端加载 Harness 的 Web UI。

最终 `dsh-desktop-delta` 发行模式继续使用官方 `sdk` profile：保持 Harness runtime、Agent 服务和插件组合，通过 stdio 暴露 JSON-RPC，并跳过 Harness SPA 客户端与 Web 前端服务。Delta 不修改 Harness 安装包、`app.asar` 或全局用户配置。

切换默认入口前，桌面版需覆盖会话浏览与恢复、普通对话、事件流、工具审批、用户提问、设置、工作区、插件、终端、崩溃恢复和升级。Delta 桌面版成为默认产品后，Harness 原生 Web UI 不作为 Delta 使用流程的入口；迁移/诊断 profile 可继续保留给维护者。

## 当前状态

当前已接通外部 Harness CLI 的官方 `sdk` profile（长期运行的 stdio JSON-RPC 服务，不启动 Harness Web Server）；支持初始化、文字与图片对话、消息／状态／工具开始与结果事件、一次性工具审批、用户提问、会话恢复、工作目录切换，并通过官方 `session/wait` 等待根 Agent 与受管子 Agent 完成；可选配置补丁通过 Harness 官方 `--patch` 启动参数传入。内核进程仍由 Harness 自己提供。Delta 在本机保存自己创建的对话目录和显示记录，不读取 Harness 私有存储。SDK 通知覆盖同一运行时中的所有会话，Delta 仅接受本机清单中且符合 Delta 会话 ID 格式的事件；未知会话的审批会被拒绝，提问会被取消。完整会话目录、设置、工作区文件浏览、插件／技能管理和终端尚未接通。`src/lib/desktop-host-client.ts` 集中处理当前 Tauri 运行时命令与事件，页面通过该连接层进行运行时操作；`src/lib/desktop-host-contract.ts` 定义 renderer 的产品级 DTO 和目标接口。完整桌面 API 仍待 Harness 提供受支持的稳定合同。
