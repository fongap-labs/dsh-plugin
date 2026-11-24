# 构建与发布

## 1. 发布模型

每个插件独立版本、独立发布。Shared 为随产品打包的内部基础库，不作为独立发布目标；仓库级产品范围由 [架构合同](../projects/architecture.json) 定义。发布清单位于：

```text
projects/<plugin>/release.manifest.json
```

清单负责声明发布目标、Release Key、许可证表达式、Node 版本文件、SBOM 名称、构建矩阵和产物名称。不要在业务代码、脚本和工作流中重复维护仓库到产品的映射。

## 2. 中央发布流程

生产发布由 `fongap-labs/action-worker` 执行：

1. 将变更合并到本仓库 `main`，并确保该提交具有中央 CI 通过证据。
2. 在 Action Worker 的 `release-app.yml` 中选择：
   - `source_repository`: `fongap-labs/plugins`
   - `requested_version`: `X.Y.Z` 或 `X.Y.Z-beta.N`
   - `product`: 对应的 `projects/<plugin>` 目录名
3. Action Worker 从当前默认分支提交读取发布清单，验证来源和 CI 证据，再按清单选择 Runner Profile。
4. 各插件的 `build-release.mjs` 是薄入口，调用通用 `scripts/build-release.mjs`。
5. 构建产物、SBOM 和来源证明通过验证后，由中央流程发布 GitHub Release。

每个产品的 Release 摘要应在对应清单的 `changelog_entries` 中单独列出。它会覆盖仓库共用 `CHANGELOG.md` 的未发布区块；多插件仓库若省略该字段，摘要会包含其他插件的更新。发布前只填写本次目标插件的变更。

纯 JavaScript/TypeScript 插件使用 `linux-standard` Runner 和 `portable` 目标，不安装 Rust。生成的 ZIP/TGZ 不包含操作系统原生二进制，供 Windows、macOS、Linux 上兼容版本的 DeepSeek Harness 安装。宿主 API 和行为仍应分别进行跨系统验证；插件依赖若引入原生模块，需重新评估发布矩阵。Action Worker 仍为其他原生应用保留 PowerShell 和 Windows 构建能力。

## 3. 产物与校验

每个插件清单声明独立的 ZIP 与 npm tarball（`.tgz`）名称。构建前注入本次发布版本，构建后恢复源码中的占位版本。Bundle 必须包含：

- `package.json`、`LICENSE`、`README.md`
- 编译后的 `lib/` 入口和声明文件
- `cordis.patch.yml`
- 插件所需的 locale、icon 和随包依赖

Action Worker 负责 SBOM、哈希、来源证明和最终 Release 资产校验。发布产物必须与清单声明完全一致。

## 4. 许可证

根目录 `LICENSE` 和根目录 `package.json.license` 定义仓库默认许可证，目前为 MIT。

每个包必须显式声明自己的 SPDX 许可证表达式，并携带自己的 `packages/<name>/LICENSE`。默认继续使用 MIT；只有在确有需要时才为单个插件选择其他许可证。

若插件使用不同许可证，必须同时更新：

1. `packages/<plugin>/package.json` 的 `license`；
2. `packages/<plugin>/LICENSE` 的完整许可证文本；
3. `projects/<plugin>/release.manifest.json` 的 `license_expression`。

CI 检查包许可证与发布清单一致，并确保 Bundle 包含对应许可证文件。修改某个插件的许可证不会自动改变其他插件或仓库根目录的默认许可证。第三方依赖仍遵循其自身许可证。

## 5. 本地发布与生产发布

仓库不提供本地发布命令。每次发行版本只能由 Action Worker 的手动 `release-app.yml` 输入，源文件中的版本保持 `0.0.0`。

生产发布优先走 Action Worker。不要在插件仓库中新增自己的完整 Release Workflow、跨仓库凭据或重复的发布治理逻辑。

## 6. 回滚

发现发布包有问题时：

1. 暂停后续发布，记录受影响插件、版本、源提交和资产哈希。
2. 通过 Harness 插件管理器或安装命令回退到已验证的历史版本。
3. 修复源码并走正常 PR、中央 CI 和新版本发布。
4. 不覆盖或重写已发布的 tag、Release 资产和来源证明。

当前 Delta Suite 使用 MIT 许可证，发布清单位于 `projects/delta-suite/release.manifest.json`。所有历史发行的既有许可与 Tag 保持原状，不再提供旧独立网页 `/dsh-ui-delta/app`；新版本须由人工选择未使用过的发行版本。

## 7. 仓库更名后的验收

GitHub 仓库名称固定为 `fongap-labs/plugins`，Delta 和 DeepSeek Harness 共用同一组 Cordis 插件。旧仓库路径只保留在历史 Tag、提交或历史审计记录中；新请求不得继续使用旧名称。

- **中央治理**：Action Worker 的仓库准入名单、PR Governance、CI Evidence、validate-merge 和中央可信 `tests/packs/plugins/` 测试包必须针对本仓库当前完整 SHA 成功；单独的通知工作流成功不能代替中央 CI。
- **产品发现**：两个独立清单分别位于 `projects/delta-suite/`、`projects/delta-code/`；二者均以 `root: packages` 为构建根，使用各自的 `build-release.mjs`。不将整个插件集合误当成单产品发布。
- **版本规则**：每次通过 Action Worker 的 `workflow_dispatch` 显式输入 `source_repository=fongap-labs/plugins`、`product=delta-*` 和 `requested_version`，不接受自动推算或仓库派发绕过手动限制。
- **发布门禁**：稳定版在正式 Tag 生效前必须完成 npm 发布及验证；`-beta.N` 只作为 GitHub 预发布，不进入 npm 正式发布分支；版本和证据验证失败时一律保持失败状态。
- **验收边界**：只能通过中央 CI、只读清单核对和不执行生产发布的预检确认迁移成功，不得通过创建测试版 Release、冒险发布 npm 包或覆盖既有 Tag 来探测链路。

## 8. 中央 CI 通知入口

本仓库只保留与 Action Worker 模板逐字一致的 `.github/workflows/notify-action-worker.yml`。PR 事件通知中央治理，main push 唤醒 Intake，由中央重新核实默认分支 SHA、安排 CI、主分支写入审计及签名证据；不再并行派发 `run-central-ci-ref`。旧 `ci.yml` 的仓库内手动入口已退役；中央 Intake 自动对账，必要时由维护者在 Action Worker 的 Intake 工作流手动发起对账。通知成功不等于 CI 通过，必须核查同一 main SHA 的 `CI Evidence` 与 `Main Write Guard`。不修改中央 Runner、执行清单、测试、授权或 required check。
