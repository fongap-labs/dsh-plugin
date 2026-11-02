# DSH Plugin

面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的原生插件集合，提供界面优化、编程辅助与插件开发模板。

本仓库采用多包工作区管理。**每个插件单独安装、单独发布；仓库根目录不是插件安装包。**

## 插件一览

| 插件 | 主要用途 | 源码 |
| --- | --- | --- |
| **Delta UI**（`@fongap-labs/dsh-ui-delta`） | 优化界面配色、排版与交互；提供可选的视觉识别、联网搜索及相关配置入口 | [查看](packages/dsh-ui-delta) |
| **Code Worker**（`@fongap-labs/dsh-code-worker`） | 批量编辑文件、查看 Git 状态与差异、探测语言服务器，并提供编码工作流指引 | [查看](packages/dsh-code-worker) |
| **插件模板**（`@fongap-labs/plugin-template`） | 创建符合本仓库结构的新插件，主要供开发者使用 | [查看](packages/plugin-template) |
| **共享库**（`@fongap-labs/shared`） | 为插件提供工具注册、子进程调用与工作区路径校验等公共能力，不作为独立插件安装 | [查看](packages/shared) |

## 安装插件

### 通过 GitHub Release 安装

打开 [发布页面](https://github.com/fongap-labs/dsh-plugin/releases)，选择对应插件的版本并下载 `.tgz` 文件。**不要把整个仓库地址或 Release 标签当作 npm 包名。**

例如，Delta UI 已有 `0.1.0-beta.2` 预发布版。可以在终端执行：

```bash
dsh plugin --profile desktop add "https://github.com/fongap-labs/dsh-plugin/releases/download/dsh-ui-delta-v0.1.0-beta.2/fongap-labs-dsh-ui-delta.tgz"
```

`desktop` 是示例配置档案名称；如果你使用其他配置档案（如 `web`），请替换为实际名称。安装完成后，前往 DeepSeek Harness 的插件页面确认插件已启用；若运行环境未启用热重载，请重启对应配置档案。

[查看 Delta UI 预发布版与校验文件](https://github.com/fongap-labs/dsh-plugin/releases/tag/dsh-ui-delta-v0.1.0-beta.2)

### 通过 npm 安装

**仅当目标版本已发布到当前使用的 npm 仓库时**，才能按包名安装。以 Delta UI 为例：

```bash
pnpm view @fongap-labs/dsh-ui-delta@0.1.0-beta.2 version --registry https://registry.npmjs.org
dsh plugin --profile desktop add @fongap-labs/dsh-ui-delta@0.1.0-beta.2
```

第一条命令应能查询到该版本，才执行第二条。GitHub Release 中存在文件，**不代表** npm 官方仓库或镜像已经收录相同版本；找不到包时请使用上述 Release `.tgz` 文件。`.zip` 是另一种构建产物，不应直接当作 npm 包名安装。

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

编译由 TypeScript 编译器完成：宿主入口输出至 `lib/index.js`，Delta UI 浏览器端输出至 `lib/client.js`。发布包使用编译后的 JavaScript，而非直接加载 `.ts` 源码。

本地联调时，可将已编译的插件链接到现有 DeepSeek Harness 配置档案：

```bash
pnpm link:dev dsh-ui-delta --profile desktop
pnpm link:dev dsh-ui-delta --profile desktop --unlink
```

第二条命令用于移除开发链接。其他参数和插件开发约定参见 [项目技能文档](.dsh/skills/SKILL.md)。

## 项目结构与发布

| 目录 | 用途 |
| --- | --- |
| `packages/` | 各插件、共享库及插件模板 |
| `projects/` | 各插件独立的发布清单 |
| `scripts/` | 构建、校验、打包及本地联调脚本 |
| `tests/` | 单元测试与回归检查 |
| `docs/` | 项目架构与技术说明 |

插件发布由 [Action Worker](https://github.com/fongap-labs/action-worker) 统一执行，依据 `projects/<插件目录>/release.manifest.json` 构建并生成独立版本及 `.zip`、`.tgz` 等发布产物。**是否已同步到 npm，以实际 npm 仓库查询结果为准。**

相关文档：[TypeScript 架构](docs/typescript-migration.md) · [变更记录](CHANGELOG.md) · [许可证文件](LICENSE) · [问题反馈](https://github.com/fongap-labs/dsh-plugin/issues)
