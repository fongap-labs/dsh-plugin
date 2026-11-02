# 架构与边界

## 1. 总体结构

`dsh-plugin` 是一个多包工作区，不是一个整体安装包。每个插件独立安装、独立版本、独立发布；共享库和模板不作为 DSH 插件入口。

| 路径 | 职责 |
| --- | --- |
| `packages/dsh-ui-delta/` | Delta UI：浏览器界面增强及 Host 端配置、视觉识别、搜索服务 |
| `packages/dsh-code-worker/` | Code Worker：文件编辑、Git、LSP 与编码工作流工具 |
| `packages/shared/` | 不含产品逻辑的通用工具注册、子进程和路径安全能力 |
| `packages/plugin-template/` | 新插件的最小工程模板 |
| `projects/<plugin>/release.manifest.json` | 每个可独立发布产品的 Action Worker 发布清单 |
| `scripts/` | 本仓库可复用的构建、打包、发布和本地联调工具 |
| `tests/` | 针对源码行为、编译产物和发布契约的测试 |
| `docs/` | 面向开发者和维护者的项目文档 |
| `.dsh/skills/` | Agent 开发技能；不放通用组织治理规范 |

仓库级 CI、PR 门禁、AI Review、Release 和 Deploy 由 Action Worker 统一治理。本仓库只保留项目执行入口和通知桥接，不复制中央策略。

## 2. 插件包边界

每个插件包应自包含其运行所需的入口、配置、图标、本地化资源、README 和许可证。插件间共享能力只能下沉到 `packages/shared`，共享库不得反向依赖业务插件，也不得包含产品专属逻辑。

包名使用 `@fongap-labs/<package-name>`。包名、Cordis patch 中的名称、包内文档和发布元数据必须一致。已发布包名属于外部接口；只有存在明确收益并提供升级方案时才调整。

## 3. Delta UI Host 与 Browser 双端

### Host

Host 入口位于 `packages/dsh-ui-delta/src/index.ts`，导出 `name`、`inject` 和 `apply(ctx)`。实现按职责拆分：

- `host/config.ts`：配置读写、Provider 归一化、密钥缓存与安全存储。
- `host/routes.ts`：本地 HTTP 路由、请求来源校验、请求体限制和版本查询。
- `host/vision.ts`：视觉识别 Provider 调用。
- `host/search.ts`：联网搜索 Provider 调用。

Host 源码由 TypeScript 编译为 `lib/` 下的 ESM。包的公开入口仍是 `lib/index.js`；拆分内部文件不得改变插件包名、导出接口、路由路径、配置格式或已发布行为。

### Browser

浏览器端目前保留一个源码入口 `src/client.ts`，编译为 `lib/client.js`。它通过 `window.__ModuleLoader__.load({ id, factory(require) { ... } })` 注册给 Harness。

其中 `factory(require)` 的 `require` 是 Harness 模块加载器注入的回调，不是 Node.js 的模块加载器。不能把普通 ESM 相对导入直接留给运行时，也不能让发布包依赖 Harness 未声明的全局变量。

浏览器源码拆分必须与单文件产物构建一起设计。只有在构建工具、输出文件名、闭包工厂结构、外部模块解析和真实 Harness 安装验证全部通过后，才允许把客户端拆成多个源码模块。当前 `tsc` 构建保持单入口，不为减少行数贸然增加打包器。

## 4. 生命周期与安全

- 插件不得修改 Harness 的核心文件或只读的 `app.asar`。
- 注册的事件、观察器、定时器、DOM 节点、样式和路由应有明确的生命周期清理策略。
- 一个可选能力失败，不应使整个插件或 Harness 原生会话、轨迹功能不可用。
- Host 本地服务只接受受信任的 loopback 请求，限制请求体大小，不向浏览器返回明文密钥。
- API Key 缓存必须按 Provider 隔离；删除 Provider 或清除密钥时同步清除对应内存缓存。
- 文件操作和子进程能力优先复用 `@fongap-labs/shared` 的安全封装。

## 5. 构建与发布边界

`package.json` 描述包自身的入口、导出和依赖；`projects/<plugin>/release.manifest.json` 描述 Action Worker 如何构建和发布该产品。两者不得维护重复且互相冲突的版本、包名或许可证信息。

Action Worker 当前 Release Build 合约要求构建项使用 PowerShell 脚本、受控 Runner Profile 和 target triple。当前插件构建入口是各包的薄 `build-release.ps1`，实际实现集中在根目录 `scripts/build-release.ps1`。若要改为跨平台 Node 构建，必须先协调修改 Action Worker 合约、执行器和测试，再同步本仓库；不能单边修改清单绕过校验。
