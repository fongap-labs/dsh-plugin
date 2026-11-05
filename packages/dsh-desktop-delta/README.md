# dsh-desktop-delta

这是 Delta Suite 的独立桌面应用，使用 Tauri 2 制作。它的目标是逐步接替 DeepSeek Harness 自带的网页界面；Harness 仍负责运行模型和工具。桌面应用与 `dsh-suite-delta` 插件并行工作，不会复制 Harness 内核。

## 目前能做什么

- 连接电脑上已有的 Harness 并发送对话。
- 在对话中发送 PNG、JPEG、WebP 或 GIF 图片（单张不超过 8 MB，最多 4 张）。
- 把 Harness 回复中的 Markdown、表格和代码块清楚地显示出来，并可一键复制代码。
- 在 Delta 中保存最近对话；重开应用后可继续这些对话。
- 在历史记录页导出或恢复本机对话备份；导入会跳过已有对话，不覆盖现有记录。
- 重命名或删除 Delta 在这台电脑上保存的对话；删除前需要确认。
- 更换当前对话使用的工作文件夹。
- 在“工作区文件”页只读浏览用户明确选择的本机工作文件夹，并预览不超过 64 KiB 的 UTF-8 文本文件。
- 在运行活动页查看当前对话中的工具执行进度和结果。
- 连接后与 Tauri Host 协商协议版本和能力，未返回的能力不可操作；序号缺口会显示事件不完整的提醒。
- 用 Delta 自己的弹窗回答工具审批和 Harness 提问。
- 在浅色和深色界面之间切换。
- Harness 进程退出或连接中断后，清理遗留进程，结束页面的等待状态，标明未完成工具的结果未知，并显示重新连接设置。

键盘快捷键：`Ctrl/⌘ + K` 新建对话，`Ctrl/⌘ + F` 搜索 Delta 本机保存的对话标题和文字内容。

最近对话记录保存在这台电脑的 Delta 应用数据中。它只列出由 Delta 创建的对话，不会展示 Harness 的其他入口或其他设备上的全部记录。Harness 虽然另有公开的 Session Controller 会话目录 API，但它通过 API Gateway 提供，当前无 Web GUI 的 `sdk` profile 没有把该接口暴露给桌面端；在官方 SDK 提供受支持的目录传输前，Delta 不会把本机列表冒充 Harness 全量会话目录。历史记录页可导出和导入 JSON 备份，文件上限为 20 MB，本机最多保存 50 条对话；导入只添加本机尚未存在的对话，恢复的记录仅供查看，无法在 Harness 中接续运行。备份只包含 Delta 本机的文字记录，不含 Harness 配置、凭据或图片原件。图片原件交给 Harness 处理；Delta 本地历史只记下“图片”标记，不另存图片文件。

遇到损坏的本机记录时，Delta 会跳过无法读取的内容，继续打开界面。若本机保存失败，界面会提示复制重要内容。

重命名只修改 Delta 本机显示的标题，不会改动 Harness 保存的会话。历史记录列表中的删除入口需要二次确认，只移除本机 Delta 的会话目录项和对应文字消息，**不会删除 Harness 会话或停止正在执行的 Harness 任务**。删除当前对话后，桌面界面会切换到新的空对话并清除当前页面的草稿、附件和活动；若本机存储失败，会尝试回滚数据并显示保存失败提醒。删除后的本机记录只能通过此前导出的 JSON 备份恢复。

## 启动开发版

在仓库根目录安装依赖，然后运行桌面应用：

```bash
pnpm install
pnpm dev:dsh-desktop-delta
```

首次连接时，需要指定 Node.js 和 Harness 的位置；也可以点“浏览 Node.js 程序”“浏览 Harness 文件夹”或“选择 dsh 启动文件”，不用手动抄路径。工作文件夹和插件配置同样可以用“浏览”选择。连接设置会保存在本机。开发版需要 Node.js 22+、Rust 1.90+，以及带有“使用 C++ 的桌面开发”工作负载的 Microsoft C++ Build Tools。Tauri 在 Windows 上还需要 WebView2；Windows 10 及更新版本通常已预装。

Delta 通过 Harness 官方 `sdk` profile 运行：Tauri 启动 `dsh --profile sdk`，使用标准输入输出连接长期运行的 JSON-RPC 服务。该 profile 不启动 Harness Web Server，也不打开 Harness 原生网页界面；Delta 自己的窗口仍由 Tauri WebView 渲染。

不要将它与 `dsh --profile headless "<task>"` 混淆。headless 每次只执行一个新任务，输出结果后退出，不适用于桌面持续会话。

如果同一套环境要部署两个包，先通过现有 Action Worker 流程发布 `dsh-suite-delta`，在 Harness 安装并启用插件；然后再安装或升级桌面端。在桌面端“更多连接设置”中选择该插件的 `cordis.patch.yml`，由 Harness 官方启动参数加载。两个包分别发布和安装，桌面安装包不捆绑插件。

## 还不能完全替代 Harness 网页界面

Harness 的官方 `sdk` profile 已支持不启动原生 Web GUI 的长期运行方式，因此 Delta 不需要等待新的无界面启动器。当前 SDK stdio 接口尚未提供完整会话目录所需的列表分页、搜索、显式创建和目录变更订阅；Harness 的公开 Session Controller API 目前通过 API Gateway 提供，尚未接入当前桌面运行通道。单独停止一条对话、Harness 设置、正式工作区文件管理、插件和 Skills 管理、终端控制等桌面接口也仍未接通。各项上游缺口和所需合同见[插件与 Skills](PLUGIN_SKILLS_API_PROPOSAL.md)、[会话目录](SESSION_DIRECTORY_API_PROPOSAL.md)、[单次取消](RUN_CANCELLATION_API_PROPOSAL.md)、[工作区文件](WORKSPACE_FILES_API_PROPOSAL.md)、[设置接口提案](SETTINGS_API_PROPOSAL.md)、[终端控制提案](TERMINAL_API_PROPOSAL.md)。

本机只读浏览只限用户明确选择的文件夹，拒绝隐藏路径、符号链接及超限预览，不支持写入。用户不应选择 Harness 私有会话、数据库、凭据或安装目录；文件系统若被其他程序并发修改，访问结果可能变化。

SDK 已支持读取已加载会话的实际工作目录，桌面端在成功提示或恢复后调用官方 `session/working-directory/get` 并显示其返回路径。该方法对未知会话可能产生懒创建副作用，因而不能用于枚举工作区。Harness 正式的工作区列表、文件树和内容预览仍需官方受支持传输；详情见[工作区与文件接口提案](WORKSPACE_FILES_API_PROPOSAL.md)。本机工作区文件页是 Tauri 限权只读浏览，不代表 Harness 已接通这些 API。

单条任务停止尚未接通：Harness 公开 Session Controller Remote API 已提供 `session.cancel`，但当前 `sdk` stdio 协议尚未暴露该方法。本地停止等待、删除本机记录或断开连接均不等于精确停止一条任务。所需上游合同见[精确取消接口提案](RUN_CANCELLATION_API_PROPOSAL.md)。

当前协议 v1.1 的协商仅发生在 Delta 与 Tauri Host 之间。Harness 官方 SDK 尚不提供自身的版本/能力协商和历史事件回放；检测到序号缺失不能自动补齐。调用超时或本地取消也不意味着 Harness 已停止实际任务，结果可能未知。

Delta 不读取 Harness 私有文件，不依赖 Harness 网页界面的内部代码，也不在桌面包里安装或复制 Harness 内核。两者的职责和待补接口见[架构说明](ARCHITECTURE.md)和[接口说明](HOST_API.md)。

构建安装包和发布流程见[桌面端打包与发布说明](DESKTOP_RELEASE.md)。

## 品牌颜色

- 浅色模式：`#286F78`
- 深色模式：`#60B4BF`
