# Delta Suite Desktop 打包与发布

## 构建

在仓库根目录安装 Node.js 22、pnpm 11.28.5、Rust stable 和 Tauri 所需系统依赖，然后运行：

    pnpm install --frozen-lockfile
    pnpm build:dsh-desktop-delta

GitHub Actions 会在 Windows、Ubuntu 和 macOS 上构建原生安装包，并检查版本号。Windows 还会静默安装再卸载 NSIS 安装包，确认安装目录里出现应用程序并在卸载后消失。Linux 和 macOS 当前只检查安装包是否成功生成，不会启动图形界面做运行测试。

CI 安装包保存 14 天，便于下载检查。Windows/Linux 使用 GitHub runner 的 x64 环境；macOS 使用 macOS runner 的原生架构。

## 发布流程

1. 更新 packages/dsh-desktop-delta/package.json、src-tauri/tauri.conf.json 和 src-tauri/Cargo.toml 中的版本号，三处必须一致。
2. 将代码合入 main 后，创建并推送形如 dsh-desktop-delta-v0.1.0 的标签，版本部分必须和上述版本号一致。
3. GitHub Actions 构建三个平台的安装包，并创建一个仅供维护者检查的草稿 Release。
4. 发布者检查安装包后，按发行要求完成签名、公证等步骤，再手动发布 Release。

目前产物没有代码签名或 macOS 公证，没有自动更新功能。草稿 Release 不会自动公开发布。首次启动仍需要单独安装 Node.js 和 Harness 官方 SDK CLI；Delta 安装包不捆绑 Harness 内核。升级前请导出或备份 Delta 本机数据。

应用标识符 com.fongap.dsh-desktop-delta 用于保留系统识别的应用身份；更名或更换标识符前，应先规划本机数据迁移。