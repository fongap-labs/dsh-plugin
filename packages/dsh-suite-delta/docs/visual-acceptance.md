# Delta Suite 视觉验收矩阵

本文件是 **待执行的真实宿主验收清单**，不能将静态测试或 CI 成功等同于 DeepSeek Harness 的视觉验收。

## 自动化入口（只读）

从仓库根目录运行。在本地隔离的 DeepSeek Harness 测试配置上启用 Delta Suite，确保页面可通过 loopback HTTP(S) 访问：

```bash
npm install --no-save playwright-core pngjs
node scripts/verify-delta-suite-ui.mjs --url http://127.0.0.1:PORT/ --theme light --chromium /path/to/chromium --output .delta-ui-acceptance/light
node scripts/verify-delta-suite-ui.mjs --url http://127.0.0.1:PORT/ --theme dark --chromium /path/to/chromium --output .delta-ui-acceptance/dark
```

## 本地截图基线对比

先在**隔离测试账号、固定 Chromium/DSH/操作系统字体和缩放**的条件下运行上述命令，生成浅色和深色各四张截图。经人工核对后，将截图复制到独立的私有基线目录，例如 `C:\\private\\delta-ui-baseline`（该目录必须在仓库外）。

随后执行：

```bash
node scripts/verify-delta-suite-ui.mjs --url http://127.0.0.1:PORT/ --theme light --baseline /private/delta-ui-baseline --max-diff-pct 0.5 --pixel-tolerance 16
node scripts/verify-delta-suite-ui.mjs --url http://127.0.0.1:PORT/ --theme dark --baseline /private/delta-ui-baseline --max-diff-pct 0.5 --pixel-tolerance 16
```

脚本在本机进程中使用 `pngjs` 解码屏幕截图，对比同主题和同窗口尺寸的 RGB 像素；任何截图缺失、尺寸不一致或超过差异阈值均返回非零退出码。未指定 `--baseline` 时只做原有的布局/键盘/颜色检查。

基线只读，**不会自动更新或提交截图**。不要使用包含真实工作会话或隐私数据的基线。字体渲染、设备缩放与动态内容都会影响像素差异；自动化通过不是人工验收的替代品。

在两次运行之间，**必须在宿主设置中实际切换主题**。参数 `--theme` 是验证期望值，不会篡改宿主主题或伪造颜色。若 DSH 依赖现有桌面浏览器登录态，可用 `--cdp http://127.0.0.1:9222` 连接本地已启用远程调试的浏览器；此模式可能导航已有页面，仅能在隔离测试实例使用。

脚本验证品牌主色、只读文件夹接口、文件夹数量、分组按钮与稳定内容区域的 `aria-controls` 关联、空格键折叠/恢复后的实际可见性、会话归属下拉框的会话专属辅助阅读名称及键盘聚焦，以及 1440/960/720/480 px 四档窗口的水平溢出。默认情况下无可用会话时，下拉交互标记 `SKIP`；任何必要验收失败将以非零退出码报告。未安装 `playwright-core` 时脚本明确退出，不会伪造成功。

**正式验收必须包含隔离测试会话。** 测试账号中创建至少一个非子 Agent、未标记空白的会话，然后为浅色和深色主题分别运行：

```bash
node scripts/verify-delta-suite-ui.mjs --url http://127.0.0.1:PORT/ --theme light --require-sessions --output .delta-ui-acceptance/light
node scripts/verify-delta-suite-ui.mjs --url http://127.0.0.1:PORT/ --theme dark --require-sessions --output .delta-ui-acceptance/dark
```

`--require-sessions` 会把本来可跳过的“无会话供键盘测试”升级为失败，避免出现没有测试会话却误判全面通过的结果。脚本只读取下拉框标签并测试聚焦，不会更改会话所属文件夹；归类和拖放的**真实写入行为**仍须按下方人工写入测试在隔离环境执行。

`--output` 可省略。指定该选项时，截图和删减敏感上下文的 JSON 结果只写到本地，不自动上传。截图可能包含私人会话信息；只能使用隔离测试账号，**不要上传截图或将它们提交到 Git**（默认目录已列入 `.gitignore`）。此脚本不会创建、重命名、删除文件夹，也不会修改会话归属。

## 验收范围

| 视图 / 操作 | 自动检查 | 浅色实测 | 深色实测 | 人工检查重点 |
| --- | --- | --- | --- | --- |
| 主界面三栏与原生侧栏 | 否 | 待验收 | 待验收 | 会话点击、置顶、归档、展开收起 |
| 文件夹浏览面板和分组数量 | 是 | 待验收 | 待验收 | 不应出现空白分组、重复标签 |
| 480/720/960/1440 px 响应式 | 是 | 待验收 | 待验收 | 无溢出、文字不覆盖控件 |
| 分组折叠及键盘操作 | 是 | 待验收 | 待验收 | Space/Tab 焦点，`aria-controls` 关联、折叠后隐藏及恢复 |
| 文件夹拖放与选择框归类 | 部分 | 待验收 | 待验收 | 自动核查会话专属标签和可聚焦性；真实归类、失败恢复及撤销需人工隔离测试 |
| 会话行尾标记与 hover 详情 | 否 | 待验收 | 待验收 | 原生状态点、时间、图标排列保持正确 |
| 设置面板和对话审批三模式 | 否 | 待验收 | 待验收 | 不能改变原生审批与会话操作 |
| 减少动态效果、125%/150% 缩放 | 否 | 待验收 | 待验收 | 无视觉抖动，弹窗与按钮可用 |

## 人工写入测试（必须隔离）

在专门创建的测试会话上新建临时文件夹、从一个文件夹拖动到另一个文件夹、使用键盘下拉菜单移出文件夹。检查视图刷新后归属仍然正确；删除临时文件夹时会话必须仍可打开。不得以真实工作会话进行破坏性测试。

## 证据与结论

记录 DSH/Delta Suite 版本、操作系统、窗口尺寸、主题、浏览器类型、运行命令、每一项的 PASS/FAIL/SKIP、复现步骤和本地截图引用。人工实测未完成前，只能标记为“待验收”。不同宿主版本不能共用此前的验收结论。
