# Delta Desktop 受管打包与发布

## 发布关系

`dsh-suite-delta` 是独立的 Harness 插件，`dsh-desktop-delta` 是 Tauri 2 原生桌面应用。两者共用 `fongap-labs/dsh-plugin` 源码仓库，但各自使用 `projects/<产品>/release.manifest.json` 声明产物和版本；桌面安装包不捆绑插件或 Harness 内核。

同批次联合交付时，先确认受支持的 Suite 插件已发布并在 Harness 中启用，再发布 Desktop。Desktop 基础对话可单独连接官方 Harness SDK，不依赖 Suite 插件已经安装。

## 中央正式发布

1. 将代码和 `projects/dsh-desktop-delta/release.manifest.json` 通过 PR 合并到 `main`，等待 Action Worker 的 CI Evidence 和 Main Write Guard 通过。
2. 确认 Action Worker 的 `macos-build` 沙箱 Runner 已正式合并，且仓库具有 `release-source` / `release-target` 授权。
3. 在 `fongap-labs/action-worker` 的 `release-app.yml` 手动运行，输入：
   - `source_repository`：`fongap-labs/dsh-plugin`
   - `product`：`dsh-desktop-delta`
   - `requested_version`：`0.1.0-beta.1`（示例）
4. Action Worker 使用已核实的 `main` SHA，在不同操作系统的沙箱 Runner 中执行源仓库提供的 `dsh-desktop-delta/build-release.mjs`。版本来自本次发布请求，而非仓库内开发用版本。
5. 每个平台必须精确生成一份约定名称的安装包并具备独立构建证明；然后由 Action Worker 打包验证、统一发布 GitHub Release。任何一平台失败均不得将本次版本标记为完整发布。

| 平台 | Rust target | Runner | 安装包 |
| --- | --- | --- | --- |
| Linux x86_64 | `x86_64-unknown-linux-gnu` | `linux-standard` | `dsh-desktop-delta-linux-x64.deb` |
| Windows x86_64 | `x86_64-pc-windows-msvc` | `windows-build` | `dsh-desktop-delta-windows-x64.exe` |
| macOS Apple Silicon | `aarch64-apple-darwin` | `macos-build` | `dsh-desktop-delta-macos-arm64.dmg` |

发布标签采用 `dsh-desktop-delta-v<semver>`，例如 `dsh-desktop-delta-v0.1.0-beta.1`。不在业务仓库新增独立发布 Workflow，也不允许发布时直接写 `main` 或创建额外 PR。

## 本机开发验证

在各平台安装 Node.js 22+、pnpm 11.28.5、Rust 1.90+ 和 Tauri 2 原生系统依赖，在仓库根目录执行：

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm build:dsh-desktop-delta
node scripts/verify-desktop-bundle.mjs
```

上述本机验证不能代替受管发布的 CI Evidence、构建来源证明和 Release Governance。代码中的 `package.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml` 保存开发版本号；受管发布脚本在安装依赖后临时统一注入请求版本，完成后恢复三个文件。

## 安全与已知限制

当前安装包不提供 Windows 代码签名、Apple Developer ID 签名、macOS 公证或自动更新。除非后续在独立受保护步骤完成签名、公证与验证，不得将其标为已签名或已公证；macOS 用户可能受到 Gatekeeper 提示。部署端必须实测安装、升级、卸载和本地数据保留；未经实测的版本不得宣称完成这些验收。

桌面应用仍需用户另外安装 Node.js 和官方 Harness SDK CLI。Tauri 只连接官方受支持的 SDK，不能读取 Harness 私有会话、设置、数据库或安装目录。升级前应导出 Delta 本机记录。
