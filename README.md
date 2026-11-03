# DSH Plugin

面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的原生插件集合，提供界面优化、编程辅助与插件开发模板。

本仓库采用多包工作区管理。**每个插件单独安装、单独发布；仓库根目录不是插件安装包。**

## 插件一览

| 插件 | 主要用途 | 源码 |
| --- | --- | --- |
| **Delta Suite / Delta 套件**（`@fongap-labs/dsh-suite-delta`） | 优化界面配色、排版与交互；提供可选的视觉识别、联网搜索及相关配置入口 | [查看](packages/dsh-suite-delta) |
| **Code Worker**（`@fongap-labs/dsh-code-worker`） | 一体化编程工作流：仓库分析、批量编辑、Git 工作树、GitHub 多账号、PR/CI 诊断与测试验证 | [查看](packages/dsh-code-worker) |
| **插件模板**（`@fongap-labs/plugin-template`） | 创建符合本仓库结构的新插件，主要供开发者使用 | [查看](packages/plugin-template) |
| **共享库**（`@fongap-labs/shared`） | 为插件提供工具注册、子进程调用与工作区路径校验等公共能力，不作为独立插件安装 | [查看](packages/shared) |

## 安装插件

### 通过 GitHub Release 安装

打开 [发布页面](https://github.com/fongap-labs/dsh-plugin/releases)，选择对应插件的版本并下载 `.tgz` 文件。**不要把整个仓库地址或 Release 标签当作 npm 包名。**

安装时应以 [Releases 页面](https://github.com/fongap-labs/dsh-plugin/releases) 中实际发布的 Delta Suite 版本为准，选择标签前缀为 `dsh-suite-delta-v` 的条目，并复制其中的 `fongap-labs-dsh-suite-delta.tgz` 资产链接。**main 已合并的功能不等于已发布的安装包。**

```bash
# 把尖括号中的地址替换为 Release 页面复制的真实 .tgz 下载链接
dsh plugin --profile desktop add "<Delta Suite Release 中的 .tgz 资产地址>"
```

`desktop` 是示例配置档案名称；如果实际使用其他配置档案（如 `web`），请替换为真实名称。安装后检查插件版本及功能开关；宿主未开启热重载时需要重启配置档案。

### 通过 npm 安装

**仅当目标版本已发布到当前使用的 npm 仓库时**，才能按包名安装。以 Delta Suite 为例：

```bash
# 先列出实际已发布到 npm 的版本，再选择其中一个已验证版本
pnpm view @fongap-labs/dsh-suite-delta versions --json --registry https://registry.npmjs.org
dsh plugin --profile desktop add "@fongap-labs/dsh-suite-delta@<已核对的版本号>"
```

先确认 npm 中存在目标版本，才执行安装命令。GitHub Release 中存在文件，**不代表** npm 官方仓库或镜像已经收录相同版本；找不到包时请使用上述 Release `.tgz` 文件。`.zip` 是另一种构建产物，不应直接当作 npm 包名安装。

## 常见问题

| 现象 | 检查方法 |
| --- | --- |
| 提示“找不到插件”或“找不到版本” | 核对完整包名、版本及 npm 仓库；必要时使用对应 Release 的 `.tgz` 地址 |
| 已安装但没有生效 | 确认安装到了正在使用的配置档案、插件已启用，随后重载或重启 DeepSeek Harness |
| 版本提示与已安装版本不一致 | 分别核对插件页面显示的版本、实际安装包版本以及 Release 版本，检查是否还存在旧包或本地开发链接 |
| 安装后原有界面或会话功能异常 | 先禁用相关插件确认是否由插件引起，再通过 [问题反馈](https://github.com/fongap-labs/dsh-plugin/issues) 提供宿主版本、插件版本和复现步骤 |

插件的宿主端代码会在 DeepSeek Harness 运行环境中执行。安装前请确认包来源可信，涉及外部模型或搜索服务的功能应由用户自行配置凭据。

## 本地开发

环境建议：Node.js 24（见 `packages/.nvmrc`）、pnpm 11.28.5（见根目录 `package.json`）。在仓库根目录运行：

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build
pnpm test
pnpm validate
```

编译由 TypeScript 编译器完成：宿主入口输出至 `lib/index.js`，Delta Suite 浏览器端输出至 `lib/client.js`。发布包使用编译后的 JavaScript，而非直接加载 `.ts` 源码。

本地联调时，可将已编译的插件链接到现有 DeepSeek Harness 配置档案：

```bash
pnpm link:dev dsh-suite-delta --profile desktop
pnpm link:dev dsh-suite-delta --profile desktop --unlink
```

第二条命令用于移除开发链接。其他参数和插件开发约定参见 [项目技能文档](.agents/skills/dsh-plugin-dev/SKILL.md)。

## 项目结构与发布

| 目录 | 用途 |
| --- | --- |
| `packages/` | 各插件、共享库及插件模板 |
| `projects/` | 各插件独立的发布清单 |
| `scripts/` | 构建、校验、打包及本地联调脚本 |
| `tests/` | 单元测试与回归检查 |
| `docs/` | 项目架构与技术说明 |

插件发布由 [Action Worker](https://github.com/fongap-labs/action-worker) 统一执行，依据 `projects/<插件目录>/release.manifest.json` 构建并生成独立版本及 `.zip`、`.tgz` 等发布产物。**是否已同步到 npm，以实际 npm 仓库查询结果为准。**

## 许可证

除非在具体插件中另有明确声明，本仓库自有插件、共享库和插件模板默认采用 [Apache-2.0](LICENSE) 许可证；**Delta Suite（Delta 套件）单独采用 MIT 许可证**；第三方依赖遵循各自的许可证。此规则不追溯修改已经发布的历史安装包。

相关文档：[架构与边界](docs/ARCHITECTURE.md) · [开发指南](docs/DEVELOPMENT.md) · [构建与发布](docs/OPERATIONS.md) · [变更记录](CHANGELOG.md) · [许可证](LICENSE) · [问题反馈](https://github.com/fongap-labs/dsh-plugin/issues)

> 迁移提示：`@fongap-labs/dsh-ui-delta` 为已停止后续维护的历史包。新版本需卸载旧包，再安装 `@fongap-labs/dsh-suite-delta`。历史 Release 标签和产物只用于追溯与回滚。
