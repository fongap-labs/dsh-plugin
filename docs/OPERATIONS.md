# 构建与发布

## 1. 发布模型

每个插件独立版本、独立发布。发布清单位于：

```text
projects/<plugin>/release.manifest.json
```

清单负责声明发布目标、Release Key、许可证表达式、Node 版本文件、SBOM 名称、构建矩阵和产物名称。不要在业务代码、脚本和工作流中重复维护仓库到产品的映射。

## 2. 中央发布流程

生产发布由 `fongap-labs/action-worker` 执行：

1. 将变更合并到本仓库 `main`，并确保该提交具有中央 CI 通过证据。
2. 在 Action Worker 的 `release-app.yml` 中选择：
   - `source_repository`: `fongap-labs/dsh-plugin`
   - `requested_version`: `X.Y.Z` 或 `X.Y.Z-beta.N`
   - `product`: 对应的 `projects/<plugin>` 目录名
3. Action Worker 从当前默认分支提交读取发布清单，验证来源和 CI 证据，再按清单选择 Runner Profile。
4. 各插件的 `build-release.mjs` 是薄入口，调用通用 `scripts/build-release.mjs`。
5. 构建产物、SBOM 和来源证明通过验证后，由中央流程发布 GitHub Release。

纯 JavaScript/TypeScript 插件使用 `linux-standard` Runner 和 `portable` 目标，不安装 Rust。生成的 ZIP/TGZ 不包含操作系统原生二进制，供 Windows、macOS、Linux 上兼容版本的 DeepSeek Harness 安装。宿主 API 和行为仍应分别进行跨系统验证；插件依赖若引入原生模块，需重新评估发布矩阵。Action Worker 仍为其他原生应用保留 PowerShell 和 Windows 构建能力。

## 3. 产物与校验

每个插件清单声明独立的 ZIP 与 npm tarball（`.tgz`）名称。构建前注入本次发布版本，构建后恢复源码中的占位版本。Bundle 必须包含：

- `package.json`、`LICENSE`、`README.md`
- 编译后的 `lib/` 入口和声明文件
- `cordis.patch.yml`
- 插件所需的 locale、icon 和随包依赖

Action Worker 负责 SBOM、哈希、来源证明和最终 Release 资产校验。发布产物必须与清单声明完全一致。

## 4. 许可证

根目录 `LICENSE` 和根目录 `package.json.license` 定义仓库默认许可证，目前为 Apache-2.0。

每个包必须显式声明自己的 SPDX 许可证表达式，并携带自己的 `packages/<name>/LICENSE`。默认继续使用 Apache-2.0；只有在确有需要时才为单个插件选择其他许可证。

若插件使用不同许可证，必须同时更新：

1. `packages/<plugin>/package.json` 的 `license`；
2. `packages/<plugin>/LICENSE` 的完整许可证文本；
3. `projects/<plugin>/release.manifest.json` 的 `license_expression`。

CI 检查包许可证与发布清单一致，并确保 Bundle 包含对应许可证文件。修改某个插件的许可证不会自动改变其他插件或仓库根目录的默认许可证。第三方依赖仍遵循其自身许可证。

## 5. 本地发布与生产发布

根目录 `pnpm release` / `pnpm release:dry-run` 是本地 npm 发布工具，按脚本中的依赖顺序处理工作区包。它与 Action Worker 的按产品 GitHub Release 流程不同，不应把本地脚本的行为误认为中央发布契约。

生产发布优先走 Action Worker。不要在插件仓库中新增自己的完整 Release Workflow、跨仓库凭据或重复的发布治理逻辑。

## 6. 回滚

发现发布包有问题时：

1. 暂停后续发布，记录受影响插件、版本、源提交和资产哈希。
2. 通过 Harness 插件管理器或安装命令回退到已验证的历史版本。
3. 修复源码并走正常 PR、中央 CI 和新版本发布。
4. 不覆盖或重写已发布的 tag、Release 资产和来源证明。

Delta Suite（Delta 套件）独立采用 MIT 许可证，发布清单位于 `projects/dsh-suite-delta/release.manifest.json`。旧标签 `dsh-ui-delta-v*` 保留作历史回滚，新版本统一使用 `dsh-suite-delta-v*`。
