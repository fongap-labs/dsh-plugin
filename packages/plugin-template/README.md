# @fongap-labs/plugin-template

DeepSeek Harness 原生插件脚手架。复制本目录创建新插件，再按下列步骤替换模板标识与实现。

## 创建

```bash
cp -r packages/plugin-template packages/plugin-my-awesome
```

## 必须调整

1. **`package.json`**
   - 将 `name` 改为 `@fongap-labs/plugin-my-awesome`。
   - 更新描述、导出入口和 `files`。
   - 默认许可证为 Apache-2.0；如需其他许可证，更新 `license` 和本包 `LICENSE`。

2. **`cordis.patch.yml`**
   - 使用全局唯一的 kebab-case `id`，例如 `plugin-my-awesome`。
   - `name` 使用与 `package.json` 一致的完整包名。

3. **`projects/plugin-my-awesome/release.manifest.json`**
   - 为需要通过 Action Worker 发布的插件新增独立清单。
   - `license_expression` 必须与包的 `package.json.license` 一致。

4. **`src/index.ts`**
   - 导出 `apply(ctx, config)`，按需导出 `inject`。
   - 使用 `@fongap-labs/shared` 提供的通用能力。
   - 路径必须经过 `resolveInside` 校验；子进程优先使用 `runCommand`。
   - 注册的事件、定时器、观察器和 UI 资源必须提供清理逻辑。

5. **资源与文档**
   - 更新 `locale/en.json`、`locale/zh.json` 和 `icon.svg`。
   - 更新插件自己的 `README.md` 和 `LICENSE`。
   - 不复制仓库级治理规则；共用规范由 Action Worker 维护。

## 本地开发与验证

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build
pnpm test
pnpm validate
pnpm link:dev plugin-my-awesome
```

## 发布边界

插件独立版本、独立发布。发布前核对包名、`cordis.patch.yml`、`release.manifest.json`、许可证及安装包内容。发布流程由 Action Worker 统一执行；不要在插件包中新增自己的完整发布工作流。
