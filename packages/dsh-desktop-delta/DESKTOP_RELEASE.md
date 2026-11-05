# Delta Suite Desktop 打包与发布

## 配套发布和安装顺序

同一批次交付两个包时，先发布和安装 Harness 插件，再发布和安装桌面端：

1. 通过现有 Action Worker 流程发布 `dsh-suite-delta` 的版本化 `.tgz`。如果本次没有插件改动，先确认 Harness 中已安装并启用受支持的 Suite 版本。
2. 在 Harness 中安装或升级 `dsh-suite-delta`，确认插件已加载；按宿主要求重新加载 Harness。
3. 再构建并发布 `dsh-desktop-delta`。需要桌面端同时加载 Suite 时，在“更多连接设置”中选择已安装插件的 `cordis.patch.yml`。

两个包独立发布、独立安装。Desktop 安装包不会复制或捆绑 Suite 插件；该顺序用于配套交付，不代表 Desktop 的基础对话运行必须依赖插件。

## 本机构建

Delta Desktop 使用仓库已有的测试、类型检查和中央 CI。这里不添加独立的 GitHub Actions 工作流，也不自动上传或发布安装包。

在 Windows、Linux 或 macOS 目标机器上安装 Node.js 22、pnpm 11.28.5、Rust stable 及 Tauri 2 所需系统依赖，然后运行：

    pnpm install --frozen-lockfile
    pnpm test
    pnpm typecheck
    pnpm build:dsh-desktop-delta
    node scripts/verify-desktop-bundle.mjs

最后一条命令会检查当前机器生成的安装包。Windows 还应手动运行 NSIS 安装包，确认应用文件安装成功，再运行安装目录中的卸载程序确认文件已删除。Linux 和 macOS 需要在对应系统上构建；没有在目标系统实际构建和安装的版本，不应标为已验证。

## 桌面端手动发布

1. 更新 packages/dsh-desktop-delta/package.json、src-tauri/tauri.conf.json 和 src-tauri/Cargo.toml 中的版本号，三处保持一致。
2. 先确认上一节中的 Suite 发布与安装步骤已完成，再在目标系统运行测试并构建桌面安装包。版本标签可使用 dsh-desktop-delta-v0.1.0 这样的格式；标签只用于版本记录，不会自动启动构建或发布。
3. 维护者检查安装包、签名和 macOS 公证状态，再通过 GitHub Release 页面手动创建草稿并上传产物。
4. 确认后由维护者手动发布。

目前安装包没有代码签名或 macOS 公证，也没有自动更新功能。首次启动仍需要单独安装 Node.js 和 Harness 官方 SDK CLI；Delta 安装包不捆绑 Harness 内核。升级前请导出或备份 Delta 本机数据。

应用标识符 com.fongap.dsh-desktop-delta 用于保留系统识别的应用身份；更名或更换标识符前，应先规划本机数据迁移。
