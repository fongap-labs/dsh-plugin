/**
 * DSH 原生 Bundle 脚手架模板（Host Plugin）。
 *
 * 复制本目录创建新插件：
 * 1. 修改 package.json 的 name、description、files。
 * 2. 修改 cordis.patch.yml 的 id 与 name（与包名一致）。
 * 3. 替换 locale/en.json、zh.json 的 meta.title / meta.description。
 * 4. 替换 icon.svg 为原创或可再分发的图标（≤ 256 KiB）。
 * 5. 在此文件编写 apply(ctx, config)，并在其中使用 @dsh-plugin/shared 注册工具。
 */

import {
  defineTool,
  registerTool,
  resolveInside,
} from "@dsh-plugin/shared";

export const name = "plugin-template";
export const inject = ["tools"];

export function apply(ctx, config) {
  const settings = config && typeof config === "object" ? config : {};
  const disposers = [];

  if (settings.enabled !== false) {
    const tool = defineTool({
      name: "template_greet",
      description: "返回配置的 greeting 文本（演示用工具）。",
      parameters: { name: { type: "string", required: true, description: "要问候的名字。" } },
      output: {
        schema: { type: "object", properties: { text: { type: "string", required: true } } },
        render: (_args, value) => [{ type: "text", text: value.text }],
      },
      async execute(args) {
        const greeting = typeof settings.greeting === "string" ? settings.greeting : "hello";
        return { text: `${greeting}, ${args.name}!` };
      },
    });
    const result = registerTool(ctx, tool);
    if (result.registered && typeof result.disposer === "function") {
      disposers.push(result.disposer);
    }
  }

  ctx.inject(["systemPrompt"], (child) => {
    try {
      const disposer = child.systemPrompt.section({
        name: "template:guidance",
        order: 1300,
        text: "这是一个模板插件，请在实际插件中替换此提示文本。",
      });
      if (typeof disposer === "function") disposers.push(disposer);
    } catch { /* ignore */ }
  });

  return () => {
    for (let i = disposers.length - 1; i >= 0; i -= 1) {
      try { disposers[i](); } catch { /* best-effort */ }
    }
  };
}