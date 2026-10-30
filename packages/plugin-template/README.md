# @dsh-plugin/plugin-template

DSH 原生 Bundle 官方脚手架模板。直接复制本目录即可快速创建新插件。

## 快速开始

```bash
cp -r packages/plugin-template packages/plugin-my-awesome
cd packages/plugin-my-awesome
```

然后按下列步骤修改：

1. **package.json**：
   - `"name": "@dsh-plugin/plugin-my-awesome"`
   - `"description": "你的插件描述"`
   - `files` 数组保持不变（除非新增资源）。

2. **cordis.patch.yml**：
   - `id: my-awesome`（全局唯一，建议 kebab-case）
   - `name: '@dsh-plugin/plugin-my-awesome'`（与包名一致）

3. **locale/en.json / zh.json**：
   - `meta.title`：在 Bundle 管理器中显示的标题。
   - `meta.description`：能力简述（≤ 1 行）。

4. **icon.svg**：
   - 原创或可再分发的 SVG / PNG / JPEG / WebP，≤ 256 KiB。
   - 路径必须在包内（绝对路径、URL、跳出包的 symlink 均被拒绝）。

5. **src/index.js**：
   - 导出 `apply(ctx, config)`，可选 `export const inject = [...]`。
   - 使用 `@dsh-plugin/shared` 的 `defineTool`、`registerTool` 等。
   - 资源注册请用 `ctx.effect` / `ctx.on` 并在返回函数中清理。

## 本地联调

```bash
# 根目录
pnpm link:dev plugin-my-awesome
```

或手动在 profile 目录（默认 `~/.dsh/profiles/desktop`）：

```bash
pnpm add link:/absolute/path/to/packages/plugin-my-awesome
# 并在 profile package.json 的 dsh.profile.bundles 追加 "@dsh-plugin/plugin-my-awesome"
```

## 发布

1. 将 `package.json` 的 `"private": true` 改为 `false`。
2. 可选：`npm publish --access public`（需先 `pnpm build` 校验资源完整性）。