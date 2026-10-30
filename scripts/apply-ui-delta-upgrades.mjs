import fs from 'node:fs';

const filePath = 'packages/dsh-ui-delta/client.js';
let code = fs.readFileSync(filePath, 'utf8');

// 1. 优化 Hover Token 与 Tooltip Token
// 替换 --dsw-alias-interactive-bg-hover
code = code.replace(
  "'--dsw-alias-interactive-bg-hover': { light: '#EEF0F2', dark: '#22252A' },",
  "'--dsw-alias-interactive-bg-hover': { light: '#E5E8EB', dark: '#282C34' },"
);
code = code.replace(
  "'--dsw-alias-interactive-bg-hover-solid': { light: '#EEF0F2', dark: '#2C2F35' },",
  "'--dsw-alias-interactive-bg-hover-solid': { light: '#E2E5E9', dark: '#2C3038' },"
);
code = code.replace(
  "'--dsw-alias-interactive-bg-active': { light: '#E8EAED', dark: '#34383F' },",
  "'--dsw-alias-interactive-bg-active': { light: '#D8DCE2', dark: '#353A44' },"
);
code = code.replace(
  "'--dsw-specific-sidebar-nav-item-hover': { light: '#EEF0F2', dark: '#202329' },",
  "'--dsw-specific-sidebar-nav-item-hover': { light: '#E4E7EB', dark: '#262930' },"
);

// 替换 Tooltip Token（浅色下不再使用黑色 #17191C，改为高雅白底）
code = code.replace(
  "'--dsw-alias-tooltip-bg': { light: '#17191C', dark: '#22252A' },",
  "'--dsw-alias-tooltip-bg': { light: '#FFFFFF', dark: '#22252A' },"
);
code = code.replace(
  "'--dsw-alias-tooltip-key-bg': { light: '#2C2F35', dark: '#34383F' },",
  "'--dsw-alias-tooltip-key-bg': { light: '#F1F3F5', dark: '#34383F' },"
);
code = code.replace(
  "'--dsw-alias-toast-bg': { light: '#17191C', dark: '#17191D' },",
  "'--dsw-alias-toast-bg': { light: '#FFFFFF', dark: '#1C1E22' },"
);
code = code.replace(
  "'--dsw-alias-toast-label': { light: '#FFFFFF', dark: '#E8EAED' },",
  "'--dsw-alias-toast-label': { light: '#17191C', dark: '#E8EAED' },"
);

// 2. 增强 CSS: color-scheme, session selected 态，浮层卡片质感，headerActions 顺序
const cssAdditions = `
/* ===== 现代颜色方案与原生窗口控制条同步 ===== */
:root, html {
  color-scheme: light dark;
}
html:not([data-theme="dark"]), html[data-theme="light"] {
  color-scheme: light !important;
}
html[data-theme="dark"] {
  color-scheme: dark !important;
}

/* 会话列表项高品质交互：强化 Hover 与 Selected 视觉层级 */
.wnFoaW_sessionRow {
  transition: background-color var(--ens-dur-fast) var(--ens-ease-standard), color var(--ens-dur-fast) var(--ens-ease-standard);
}
.wnFoaW_sessionRow:hover {
  background: var(--dsw-alias-interactive-bg-hover) !important;
}
.wnFoaW_sessionRow.wnFoaW_selected {
  background: var(--dsw-specific-sidebar-nav-item-active) !important;
  color: var(--ens-accent-strong) !important;
  font-weight: 500;
  box-shadow: inset 2px 0 0 0 var(--dsw-alias-brand-primary);
}

/* 现代浮层卡片体系（Tooltip/Popover）：白底磨砂 + 漫反射高级阴影 */
[role="tooltip"],
[class*="tooltip"]:not(.ens-foot-notify),
[class*="popover"] {
  background: var(--dsw-alias-bg-layer-1) !important;
  color: var(--dsw-alias-label-primary) !important;
  border: 1px solid var(--dsw-alias-border-l1) !important;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.12), 0 2px 6px rgba(0, 0, 0, 0.04) !important;
  backdrop-filter: blur(12px) !important;
  border-radius: var(--dsw-radius-md) !important;
}
[role="tooltip"] *,
[class*="tooltip"]:not(.ens-foot-notify) * {
  color: inherit;
}
[role="tooltip"] [class*="caption"],
[role="tooltip"] [class*="time"],
[role="tooltip"] [class*="secondary"],
[class*="tooltip"] [class*="caption"],
[class*="tooltip"] [class*="time"] {
  color: var(--dsw-alias-label-secondary) !important;
}

/* 顶栏操作区：后台任务与创造模式对调位置（后台任务居左，创造模式居右） */
.an3WzG_headerActions,
[class*="headerActions"] {
  display: flex !important;
  align-items: center !important;
  gap: 8px !important;
}
.an3WzG_headerActions > :has(.Ag-ohG_count),
.an3WzG_headerActions > :has([class*="count"]),
[class*="headerActions"] > :has(.Ag-ohG_count),
[class*="headerActions"] > :has([class*="count"]) {
  order: -10 !important;
}
`;

// 把 cssAdditions 插入到 STYLESHEET 开头
code = code.replace("const STYLESHEET = `", "const STYLESHEET = `" + cssAdditions);

// 3. 修复底部动作栏布局（新版本提示与设置图标并排）
const oldFootActionsCss = `.wtg9ga_footArea { position: relative; }
/* The host's footerActions is a flex row (account avatar flex:1 on the left,
   our actions on the right). Use flex ordering instead of absolute positioning
   so layout stays stable across collapsed/expanded rails and themes. */
.ens-foot-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;          /* push to far right inside footerActions */
  z-index: 20;                /* above the avatar's click layer (z:10) but below modal */
  flex-shrink: 0;
  flex-wrap: nowrap;          /* keep notify + 设置 + 登录/登出 on one line */
}`;

const newFootActionsCss = `/* Foot actions (#30): notify pill + 设置 + 登录/登出, pinned to the bottom-right
   of .wtg9ga_footArea (position:absolute) so the group always sits on the same
   horizontal line as the account trigger regardless of how the host nests
   footerActions inside footArea (which is a column-flex). */
.wtg9ga_footArea { position: relative; }
.ens-foot-actions {
  position: absolute;         /* anchored to footArea, not in column flow */
  bottom: 6px;                /* matches .ens-balance; alignFootRow fine-tunes */
  right: 8px;                 /* default; alignFootRow aligns glyph to search field */
  display: flex;
  align-items: center;
  gap: 8px;
  z-index: 20;                /* above the avatar's click layer (z:10) but below modal */
  flex-wrap: nowrap;          /* keep notify + 设置 + 登录/登出 on one line */
}`;

if (code.includes(oldFootActionsCss)) {
  code = code.replace(oldFootActionsCss, newFootActionsCss);
  console.log('Foot actions CSS replaced.');
}

// 移除 collapsed 下的 margin-left: 0
code = code.replace(
  '.wtg9ga_collapsed .ens-foot-actions { flex-direction: column; align-items: center; margin-left: 0; }',
  '.wtg9ga_collapsed .ens-foot-actions { flex-direction: column; align-items: center; }'
);

// 4. 多语言国际化 (aria-label="关闭", '设置' -> t('设置', 'Settings'), '登录' -> t('登录', 'Sign in'))
code = code.replace(
  'notify.innerHTML = \'<span></span><button class="ens-foot-notify-close" aria-label="关闭">×</button>\';',
  'notify.innerHTML = `<span></span><button class="ens-foot-notify-close" aria-label="${t(\'关闭\', \'Close\')}">×</button>`;'
);

code = code.replace(
  "iconBtn('settings', ICON_SETTINGS, '设置', () => openSettings());\r\n              const settingsBtn = box.querySelector('[data-ens=\"settings\"]');\r\n              if (settingsBtn) settingsBtn.title = '设置';\r\n              iconBtn('account', ICON_LOGIN, '登录', () => (signedIn() ? signOutFromMenu() : startSignIn()));",
  "iconBtn('settings', ICON_SETTINGS, t('设置', 'Settings'), () => openSettings());\r\n              const settingsBtn = box.querySelector('[data-ens=\"settings\"]');\r\n              if (settingsBtn) settingsBtn.title = t('设置', 'Settings');\r\n              iconBtn('account', ICON_LOGIN, t('登录', 'Sign in'), () => (signedIn() ? signOutFromMenu() : startSignIn()));"
);

code = code.replace(
  "iconBtn('settings', ICON_SETTINGS, '设置', () => openSettings());\n              const settingsBtn = box.querySelector('[data-ens=\"settings\"]');\n              if (settingsBtn) settingsBtn.title = '设置';\n              iconBtn('account', ICON_LOGIN, '登录', () => (signedIn() ? signOutFromMenu() : startSignIn()));",
  "iconBtn('settings', ICON_SETTINGS, t('设置', 'Settings'), () => openSettings());\n              const settingsBtn = box.querySelector('[data-ens=\"settings\"]');\n              if (settingsBtn) settingsBtn.title = t('设置', 'Settings');\n              iconBtn('account', ICON_LOGIN, t('登录', 'Sign in'), () => (signedIn() ? signOutFromMenu() : startSignIn()));"
);

code = code.replace(
  "const label = on ? '登出' : '登录';",
  "const label = on ? t('登出', 'Sign out') : t('登录', 'Sign in');"
);

// 5. 在 JS 循环中加入动态主题切换同步（右上角窗口控制器零延迟响应）以及顶栏动作对调的稳健保证
const runtimeAdditions = `
            // 实时主题同步：更新 meta[theme-color] 与 document.documentElement.style.colorScheme
            function syncThemeColorScheme() {
              const isDark = document.documentElement.classList.contains('dark') ||
                             document.documentElement.getAttribute('data-theme') === 'dark' ||
                             document.body.classList.contains('dark');
              const scheme = isDark ? 'dark' : 'light';
              if (document.documentElement.style.colorScheme !== scheme) {
                document.documentElement.style.colorScheme = scheme;
              }
              let meta = document.querySelector('meta[name="theme-color"]');
              if (!meta) {
                meta = document.createElement('meta');
                meta.name = 'theme-color';
                document.head.appendChild(meta);
              }
              const targetColor = isDark ? '#131417' : '#F5F6F7';
              if (meta.content !== targetColor) {
                meta.content = targetColor;
              }
            }

            // 顶栏操作区位置校准：确保后台任务在创造模式左侧
            function syncHeaderActionsOrder() {
              const container = document.querySelector('.an3WzG_headerActions') || document.querySelector('[class*="headerActions"]');
              if (!container) return;
              const countEl = container.querySelector('.Ag-ohG_count') || container.querySelector('[class*="count"]');
              if (!countEl) return;
              let jobItem = countEl;
              while (jobItem && jobItem.parentElement && jobItem.parentElement !== container) {
                jobItem = jobItem.parentElement;
              }
              if (!jobItem || jobItem.parentElement !== container) return;

              const children = Array.from(container.children);
              const modeItem = children.find(el => el !== jobItem && (el.textContent.includes('模式') || el.querySelector('svg')));
              if (modeItem) {
                const modeIndex = children.indexOf(modeItem);
                const jobIndex = children.indexOf(jobItem);
                if (modeIndex < jobIndex) {
                  container.insertBefore(jobItem, modeItem);
                }
              }
            }
`;

// 找到 run() 函数，把 syncThemeColorScheme() 和 syncHeaderActionsOrder() 放进去
code = code.replace("function run() {", runtimeAdditions + "\n            function run() {\n              syncThemeColorScheme();\n              syncHeaderActionsOrder();");

fs.writeFileSync(filePath, code, 'utf8');
console.log('All upgrades applied successfully to client.js!');
