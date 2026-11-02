# @fongap-labs/plugin-template

DeepSeek Harness Host Plugin 最小模板。参考 dsh-ui-delta 的「入口编排、功能模块、配置归一化、生命周期清理」模式，但不预装 UI、浏览器脚本、搜索依赖或额外构建器。

## 推荐：自动生成新插件

在仓库根目录运行：

```bash
pnpm scaffold --name plugin-my-awesome --description "My DeepSeek Harness plugin"
```

也可先检查将创建的路径而不写入文件：

```bash
pnpm scaffold --name plugin-my-awesome --dry-run
```

生成器会一次性创建 `packages/plugin-my-awesome/` 和 `projects/plugin-my-awesome/release.manifest.json`，并从模板与包名推导：

- 完整 npm 包名、Cordis patch ID / name、Host 入口 `name`；
- 独立 `build-release.ps1` 的 `-Package` 参数；
- Release key、资产名称、SBOM 名、构建路径及许可证；
- 中英文描述、基础 README、类型声明和图标。

插件名称必须使用小写 kebab-case，目标目录已存在时直接拒绝覆盖；出错会清除此次生成的半成品。新包不会复制模板的 `lib/`、`dist/` 或 `node_modules/`。npm 包作用域继承模板的作用域，版本由发布流程注入，不需要在多个位置维护。

## 代码结构

```text
src/
  index.ts             # Host 身份、inject、apply、资源回收
  host/
    config.ts           # 配置归一化和默认值
    greeting.ts         # 演示工具定义；新插件按需替换
```

- `src/index.ts` 保留不可避免的**唯一包名常量**，供 Harness 原生加载器识别；生成器负责同步替换。
- 演示工具名从包名生成，避免多个生成插件共享 `template_greet` 并冲突。
- 宿主接口通过 Cordis 注入或可选服务检测获取，不依赖 Harness 内部 CSS 类名、隐藏的页面状态或私有路径。
- `systemPromptText` 不配置则**完全不注入模板提示词**。开启后优先读取宿主 `getSectionOrder('TOOL_EDIT')`，也可通过 `promptOrder` 配置覆盖；宿主缺失时才使用命名的兼容默认值。
- 每次 `registerTool` / `systemPrompt.section` 返回的 disposer 都被收集，卸载时逆序且幂等清理；可选服务未注册时仅跳过相应功能。
- 示例配置只演示 `enabled`、`greeting`、`systemPromptText` 和 `promptOrder`。真实业务的工具、数据结构和安全策略应放在独立模块中，而非继续堆进 `index.ts`。

## 手工复制（备选）

如果不使用生成器，可以复制 `packages/plugin-template` 并依次修改包名、`cordis.patch.yml`、`src/index.ts`、`build-release.ps1`、本地化资源和独立发布清单；推荐运行生成器来避免不同文件的标识不一致。

## Browser 扩展边界

只有确实需要 Webview 时才增加 `src/client.ts`、`tsconfig.client.json` 和 `package.json.dsh.client` / `exports['./client']`。Harness Browser 的 `factory(require)` 不是 Node `require`，不能直接把多文件 ESM 编译结果当作浏览器入口。若要像 dsh-ui-delta 一样增加 UI，需同时增加编译与包内资源测试，确保最终输出可被宿主加载；不可盲目复制其所有注入包或内部 CSS 选择器。

## 开发与发布

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build
pnpm test
pnpm validate
pnpm link:dev plugin-my-awesome
```

插件独立版本、独立发布。每个包保留 Apache-2.0 许可证作为默认值；选择其他许可证时必须同时修改包内 LICENSE 和对应 Release Manifest。发布仍由 Action Worker 执行，生成器不创建 GitHub Actions 工作流，也不会自动发布或向 Harness 写入 Profile。

`@fongap-labs/shared` 提供受控路径解析、工具定义/注册与子进程接口。涉及文件操作时必须验证沙箱边界；涉及命令执行时优先使用共享的受控封装，避免把用户输入拼进 shell 命令。
