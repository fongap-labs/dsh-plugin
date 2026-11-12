# 开发指南

## 1. 环境

- Node.js：24，版本来源为 `packages/.nvmrc`。
- pnpm：以根目录 `package.json.packageManager` 为唯一版本来源，当前为 `pnpm@11.28.5`。
- TypeScript：由根目录锁文件固定版本。

安装依赖：

```bash
pnpm install --frozen-lockfile
```

## 2. 常用命令

在仓库根目录执行：

| 命令 | 用途 |
| --- | --- |
| `pnpm typecheck` | 编译共享库声明并检查 Delta Code、Delta Desktop 的 Host/Browser 源码 |
| `pnpm build` | 编译所有工作区包 |
| `pnpm test` | 运行 Node 内置测试 |
| `pnpm validate` | 校验插件 Bundle 结构与文件清单 |
| `pnpm pack:bundles` | 生成本地 Bundle ZIP |
| `pnpm link:dev <plugin>` | 链接插件到本地 DSH Profile |
| `pnpm link:dev <plugin> --unlink` | 移除本地开发链接 |

测试依赖已编译的 `lib/` 产物。干净检出后先执行 `pnpm build`，再运行测试和 Bundle 校验。

## 3. 新增独立产品（仅在需要时）

当前仅维护两个实际插件产品：`dsh-delta-desktop` 与 `dsh-delta-code`。不再内置示例插件、插件模板或脚手架生成命令。

确需新增独立插件时，在 `packages/<name>/` 创建源码、`package.json`、`cordis.patch.yml`、LICENSE 和 README，并在 `projects/<name>/release.manifest.json` 明确单产品发布入口。参考真实插件的契约，但不要复制业务逻辑、私有 UI 选择器或产品身份。

将必要的编译配置加入根目录构建命令和中央 CI，补充生命周期、权限边界、包内资源和发行清单测试。新产品必须执行 `pnpm build && pnpm test && pnpm validate` 并通过宿主实机验收；发布仍由 Action Worker 管理。

## 4. 套件模块约定

Host 端新功能按职责放入 `src/host/`，入口只负责注册和组合。配置、视觉识别、搜索和路由不得重新堆回单一入口文件。

Browser 端当前只有一个构建入口。任何客户端模块化工作必须同时提交构建配置、锁文件和产物契约测试，并验证真实 Harness 安装。不能只拆 TypeScript 文件而让运行时出现无法解析的相对模块。

## 5. 测试要求

- 单元测试验证输入边界、错误处理和纯函数行为。
- 插件契约测试验证 `apply`、`inject`、路由及宿主降级行为。
- UI 回归测试验证原生会话、轨迹、侧栏、搜索和主题共存。
- 发布测试验证包入口、Bundle 文件、版本、许可证及 manifest。
- 修改构建或加载机制时，除 CI 外必须进行真实 Harness Profile 安装、启用、禁用和重启验证。

不要通过只检查源码字符串来替代行为测试；源码断言只适用于稳定的构建或宿主契约。

## 6. 文档与代码规范

- 根目录只保留 README、Agent 入口、许可证、变更记录和工程配置。
- 长期维护的架构、开发和运维说明放在 `docs/`。
- 插件独立使用说明放在对应包的 `README.md`。
- 面向使用者和维护者的说明使用中文；Agent 入口、机器契约和技能文件使用英文。
- 禁止写入开发者个人绝对路径、临时机器状态和一次性源码替换脚本。
