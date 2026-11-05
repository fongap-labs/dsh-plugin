# dsh-desktop-delta

这是 Delta Suite 的独立桌面应用，使用 Tauri 2 制作。它的目标是逐步接替 DeepSeek Harness 自带的网页界面；Harness 仍负责运行模型和工具。桌面应用与 `dsh-suite-delta` 插件并行工作，不会复制 Harness 内核。

## 目前能做什么

- 连接电脑上已有的 Harness 并发送对话。
- 在对话中发送 PNG、JPEG、WebP 或 GIF 图片（单张不超过 8 MB，最多 4 张）。
- 把 Harness 回复中的 Markdown、表格和代码块清楚地显示出来，并可一键复制代码。
- 在 Delta 中保存最近对话；重开应用后可继续这些对话。
- 重命名 Delta 在这台电脑上保存的对话。
- 更换当前对话使用的工作文件夹。
- 在运行活动页查看当前对话中的工具执行进度和结果。
- 用 Delta 自己的弹窗回答工具审批和 Harness 提问。
- 在浅色和深色界面之间切换。
- Harness 连接中断后，结束页面的等待状态，标明未完成工具的结果未知，并显示重新连接设置。

键盘快捷键：`Ctrl/⌘ + K` 新建对话，`Ctrl/⌘ + F` 搜索 Delta 本机保存的对话标题和文字内容。

最近对话记录保存在这台电脑的 Delta 应用数据中。它只列出由 Delta 创建的对话，不会展示 Harness 的其他入口或其他设备上的全部记录。图片原件交给 Harness 处理；Delta 本地历史只记下“图片”标记，不另存图片文件。

遇到损坏的本机记录时，Delta 会跳过无法读取的内容，继续打开界面。若本机保存失败，界面会提示复制重要内容。

重命名只修改 Delta 本机显示的标题，不会改动 Harness 保存的会话。

## 启动开发版

在仓库根目录安装依赖，然后运行桌面应用：

```bash
pnpm install
pnpm dev:dsh-desktop-delta
```

首次连接时，需要指定 Node.js 和 Harness 的位置；也可以点“浏览 Node.js 程序”“浏览 Harness 文件夹”或“选择 dsh 启动文件”，不用手动抄路径。工作文件夹和插件配置同样可以用“浏览”选择。连接设置会保存在本机。开发版需要 Node.js 22+、Rust 1.90+，以及带有“使用 C++ 的桌面开发”工作负载的 Microsoft C++ Build Tools。Tauri 在 Windows 上还需要 WebView2；Windows 10 及更新版本通常已预装。

如果还要让 Harness 同时加载 `dsh-suite-delta`，请先按原方式在 Harness 中安装这个插件，再展开“更多连接设置”，点“浏览配置文件”选择它的 `cordis.patch.yml`。桌面端只把该配置交给 Harness 官方启动参数读取，不会安装插件或复制插件代码。这个步骤可以跳过。

## 还不能完全替代 Harness 网页界面

Harness 当前公开的连接接口没有提供全量会话列表、单独停止一条对话、Harness 设置、工作区文件浏览、插件和技能管理、终端控制等桌面功能。因此 Delta 还不能称为完整替代品。完成接管还需要 Harness 提供受支持的桌面接口，并提供不启动原生网页界面的运行方式。

Delta 不读取 Harness 私有文件，不依赖 Harness 网页界面的内部代码，也不在桌面包里安装或复制 Harness 内核。两者的职责和待补接口见[架构说明](ARCHITECTURE.md)和[接口说明](HOST_API.md)。

## 品牌颜色

- 浅色模式：`#286F78`
- 深色模式：`#60B4BF`
