/**
 * DeltaUI — browser half.
 *
 * Composes two contributions over the shipped Harness Web UI, all owned by a
 * single plugin context and reverted on unload:
 *
 *  1. A palette layer via `ctx.theme.overrideTokens`. The base theme stays
 *     registered; this layer stacks refined surface, border, label, brand and
 *     sidebar/conversation tokens over it, light and dark. The layout presenter
 *     re-publishes the composed snapshot, so the refresh follows light/dark and
 *     font-size switches like any built-in palette.
 *
 *  2. A design-layer stylesheet: a tighter radius/spacing scale, calmer
 *     elevation, refined focus rings and scrollbars, and component-level polish
 *     (sidebar rows, search, composer card, chat bubbles, code blocks, settings
 *     nav). It targets the current shipped class hooks and degrades gracefully —
 *     every rule is independent, so a future app build that renames a hook
 *     simply drops that one refinement.
 *
 *  Navigation and copy: the shipped global-panel cells ('plugins', 'schedules')
 *  are intentionally left to their owning packages. Reusing a shipped cell id
 *  collides with the owner's own registration in this build — the owner fails to
 *  activate and the web boot aborts — so DeltaUI restyles those rows instead of
 *  replacing them.
 *
 *  DeltaUI reads theme tokens; its own chrome (foot 设置 button, search dock,
 *  annotation pill) is additive and reverts on unload. Inside the settings
 *  open fallback it may additionally require sibling @deepseek-ai client
 *  packages to look for an open()-style export — read-only, verified, guarded.
 */
window.__ModuleLoader__.load({
  id: '@fongap-labs/dsh-ui-delta',
  factory(require: HarnessRequire) {
    const SOURCE = 'dsh-ui-delta';
    // v0.1.0 — absorbed v0.1.0 enhancements: design-layer dropdown, settings
    // resize grip, annotation hover auto-hide, preview badge suppress, extended
    // form normalization, Delta-only tokens, contrast-verified palette.

    /**
     * Bilingual copy for the plugin's own chrome. The document language is the
     * single source, so a locale switch needs no service dependency.
     *
     * Scope rule: `t(zh, en)` covers copy this plugin *renders*. Text used to
     * *find* what the host rendered (a badge reading 预览版, a tab reading
     * 第三方模型提供商, a status reading 深度求索中) must stay a literal match —
     * translating it would make the lookup fail and the feature silently stop
     * working. Those literals live next to their matcher, never here.
     */
    const isZhUi = () => {
      try {
        const lang = document.documentElement.lang || navigator.language || 'zh';
        return /^zh/i.test(lang);
      } catch { return true; }
    };
    const t = (zh: string, en: string) => (isZhUi() ? zh : (en || zh));

    /**
     * Palette overlay — Delta 视觉系统完整映射到 Harness 104 个 alias token，
     * 双色系亮暗各 52，全部满足 WCAG 2.1 AA（关键组合达 AAA 7:1）。
     *
     * 一个强调色、一套暖中性、三个语义色：
     *  - accent (品牌青)    亮色 #286F78，暗色 #5CA6B0（深色面上仍保 7:1+ 文字对比度）；
     *                      废弃原蓝色系 #4176e6。
     *  - neutrals (暖中性)  画布 #F5F6F7，面板白 #FFFFFF，surface-2 #EEF0F2，
     *                      surface-3 #E8EAED；暗色炭灰阶梯 #131417→#2C2F35，
     *                      label 阶梯以 #1C1E22 为底锚定 7:1 最小差。
     *  - semantic          success #2F7D57 / #6FBF9A，warn #B45309 / #F59E0B，
     *                      error #B91C1C / #F07067（均 4.5:1+）。
     * 所有值均为具体 CSS 色值，由 theme presenter 内联发布；配对保持双系可读。
     * tools/palette_aaa.py 重跑 WCAG 2.1 AA/AAA（0 失败）。
     */
    const PALETTE: Record<string, { light: string; dark: string }> = {
      // ===== surfaces & layering =====
      '--dsw-alias-bg-base': { light: '#F5F6F7', dark: '#131417' },
      '--dsw-alias-bg-layer-1': { light: '#FFFFFF', dark: '#1C1E22' },
      '--dsw-alias-bg-layer-2': { light: '#EEF0F2', dark: '#22252A' },
      '--dsw-alias-bg-layer-3': { light: '#E8EAED', dark: '#2C2F35' },
      '--dsw-alias-bg-overlay': { light: 'rgba(245,246,247,0.86)', dark: 'rgba(19,20,23,0.86)' },
      '--dsw-alias-bg-skeleton': { light: '#E8EAED', dark: '#26292F' },
      '--dsw-alias-bg-mask-drop': { light: 'rgba(255,255,255,0.70)', dark: 'rgba(39,39,48,0.70)' },
      '--dsw-alias-bg-document-preview': { light: '#FFFFFF', dark: '#17181C' },
      '--dsw-alias-bg-document-selection': { light: 'rgba(40,111,120,0.18)', dark: 'rgba(92,166,176,0.22)' },
      '--dsw-alias-bg-multi-select': { light: '#E8EAED', dark: '#2C2F35' },
      '--dsw-alias-bg-module-platform': { light: '#E8EAED', dark: '#2C2F35' },
      // ===== hairline borders =====
      '--dsw-alias-border-l1': { light: '#E8EAED', dark: '#2A2D33' },
      '--dsw-alias-border-l2': { light: '#D9DDE2', dark: '#35393F' },
      '--dsw-alias-border-l2-darkmode-thin': { light: '#D9DDE2', dark: '#2A2D33' },
      // l3 = 控件边界（输入框/卡片描边），非文字 ≥3:1
      '--dsw-alias-border-l3': { light: '#838B92', dark: '#6B7079' },
      '--dsw-alias-border-l4': { light: '#7D848C', dark: '#7D848C' },
      '--dsw-alias-border-inverted': { light: '#E8EAED', dark: '#2A2D33' },
      '--dsw-alias-border-inverted2': { light: '#D9DDE2', dark: '#35393F' },
      // ===== focus ring =====
      // 规范焦点环：2px 纯品牌青 teal-500，浅底 #4E929C（3.5:1），
      // 深底 #5CA6B0（6.1:1）。仅焦点环用青，不复用为按钮底色。
      '--ens-focus-ring': { light: '#4E929C', dark: '#5CA6B0' },
      // ===== labels — ink ladder（AAA 7:1 on every surface）=====
      '--dsw-alias-label-primary': { light: '#17191C', dark: '#E8EAED' },
      '--dsw-alias-label-secondary': { light: '#5B616B', dark: '#C3C8D0' },
      '--dsw-alias-label-tertiary': { light: '#6B7079', dark: '#9AA1AA' },
      '--dsw-alias-label-caption': { light: '#6B7079', dark: '#9AA1AA' },
      // text on filled controls: white on light-teal fill, near-black on
      // the dark mint-teal fill (both clear 7:1)
      '--dsw-alias-label-primary-inverted': { light: '#FFFFFF', dark: '#0E1A1C' },
      '--dsw-alias-label-primary-foreground': { light: '#FFFFFF', dark: '#0E1A1C' },
      '--dsw-alias-label-primary-bluish': { light: '#17191C', dark: '#E8EAED' },
      '--dsw-alias-label-primary-dimmed': { light: '#2A2E33', dark: '#C8CCD2' },
      '--dsw-alias-label-dimmed': { light: '#E9ECF2', dark: '#2C2C2E' },
      '--dsw-alias-label-deep-diving': { light: '#286F78', dark: '#5CA6B0' },
      '--dsw-alias-label-document-preview': { light: '#17191C', dark: '#E8EAED' },
      '--dsw-alias-label-shimmer': { light: 'rgba(23,25,28,0.30)', dark: 'rgba(232,234,237,0.45)' },
      '--dsw-alias-label-deep-diving-shimmer': { light: 'rgba(40,111,120,0.18)', dark: 'rgba(92,166,176,0.22)' },
      '--dsw-alias-link': { light: '#286F78', dark: '#5CA6B0' },
      // ===== brand / accent — one Delta teal, blue family retired =====
      '--dsw-alias-brand-primary': { light: '#286F78', dark: '#5CA6B0' },
      '--dsw-alias-brand-primary-invert': { light: '#70B1BA', dark: '#286F78' },
      '--dsw-alias-brand-primary-new-colorprimary-new-color': { light: '#286F78', dark: '#5CA6B0' },
      '--dsw-alias-state-business-primary': { light: '#286F78', dark: '#5CA6B0' },
      '--dsw-alias-state-business-tertiary': { light: '#E7F0F2', dark: '#1C3B40' },
      // 选中文案在 selected 底上的高对比青：浅 #286F78（4.94:1），深 teal-300 #8CC4CC（6.18:1）
      '--ens-accent-strong': { light: '#286F78', dark: '#8CC4CC' },
      // ===== semantic states (4.5:1+, text-friendly) =====
      '--dsw-alias-state-success-primary': { light: '#2F7D57', dark: '#6FBF9A' },
      '--dsw-alias-state-success-secondary': { light: '#2F7D57', dark: '#6FBF9A' },
      '--dsw-alias-state-success-tertiary': { light: '#EEF6F0', dark: '#22352B' },
      '--dsw-alias-state-warn-primary': { light: '#B45309', dark: '#F59E0B' },
      '--dsw-alias-state-warn-secondary': { light: '#B45309', dark: '#F59E0B' },
      '--dsw-alias-state-warn-tertiary': { light: '#FDF4E7', dark: '#3A2E1B' },
      '--dsw-alias-state-warn-label': { light: '#B45309', dark: '#F59E0B' },
      '--dsw-alias-state-error-primary': { light: '#B91C1C', dark: '#F07067' },
      '--dsw-alias-state-error-secondary': { light: '#B91C1C', dark: '#F07067' },
      '--dsw-alias-state-idle-primary': { light: '#5B616B', dark: '#9AA1AA' },
      // ===== buttons (fills) =====
      '--dsw-alias-button-primary-fill': { light: '#286F78', dark: '#5CA6B0' },
      '--dsw-alias-button-primary-hover': { light: '#1D5E66', dark: '#70B1BA' },
      '--dsw-alias-button-primary-dimmed': { light: '#3D808A', dark: '#4E929C' },
      '--dsw-alias-button-info-fill': { light: '#286F78', dark: '#5CA6B0' },
      '--dsw-alias-button-info-hover': { light: '#1D5E66', dark: '#70B1BA' },
      '--dsw-alias-button-contrast-fill': { light: '#17191C', dark: '#E8EAED' },
      '--dsw-alias-button-elevated-fill': { light: '#FFFFFF', dark: '#1C1E22' },
      '--dsw-alias-button-floating-fill': { light: '#FFFFFF', dark: '#22252A' },
      '--dsw-alias-button-floating-hover': { light: '#EEF0F2', dark: '#2C2F35' },
      '--dsw-alias-button-ghost-active-fill': { light: '#E8EAED', dark: '#2C2F35' },
      '--dsw-alias-button-ghost-active-hover': { light: '#E2E6EA', dark: '#34383F' },
      '--dsw-alias-button-ghost-active-border': { light: '#B9C0C7', dark: '#43484F' },
      '--dsw-alias-button-tool-bar-fill': { light: '#EEF0F2', dark: '#22252A' },
      '--dsw-alias-button-tool-bar-fill-invisible': { light: 'transparent', dark: 'transparent' },
      '--dsw-alias-button-tool-bar-hover': { light: '#E8EAED', dark: '#2C2F35' },
      // ===== interactive fills =====
      '--dsw-alias-interactive-bg-hover': { light: '#E5E8EB', dark: '#282C34' },
      '--dsw-alias-interactive-bg-hover-solid': { light: '#E2E5E9', dark: '#2C3038' },
      '--dsw-alias-interactive-bg-active': { light: '#D8DCE2', dark: '#353A44' },
      '--dsw-alias-interactive-bg-hover-accent': { light: 'rgba(40,111,120,0.10)', dark: 'rgba(92,166,176,0.16)' },
      '--dsw-alias-interactive-bg-hover-danger': { light: 'rgba(185,28,28,0.10)', dark: 'rgba(240,112,103,0.16)' },
      // ===== code & markdown =====
      '--dsw-alias-markdown-code-block': { light: '#EEF0F2', dark: '#191B1F' },
      '--dsw-alias-markdown-code-block-banner': { light: '#E8EAED', dark: '#22252A' },
      '--dsw-alias-markdown-inline-code': { light: '#EEF0F2', dark: '#262A30' },
      '--dsw-alias-markdown-citation': { light: '#286F78', dark: '#5CA6B0' },
      '--dsw-alias-markdown-tag': { light: '#E7F0F2', dark: '#1C3B40' },
      // ===== menus, scrollbars, tooltips/toasts =====
      '--dsw-menu-surface-fill': { light: 'rgba(255,255,255,0.94)', dark: 'rgba(28,30,34,0.94)' },
      '--dsw-alias-menu-icon': { light: '#5B616B', dark: '#C3C8D0' },
      '--dsw-alias-scrollbar-bg-l1': { light: 'rgba(23,25,28,0.16)', dark: 'rgba(232,234,237,0.14)' },
      '--dsw-alias-scrollbar-hover-l1': { light: 'rgba(23,25,28,0.28)', dark: 'rgba(232,234,237,0.26)' },
      '--dsw-alias-scrollbar-bg-l2': { light: 'rgba(23,25,28,0.16)', dark: 'rgba(232,234,237,0.14)' },
      '--dsw-alias-scrollbar-hover-l2': { light: 'rgba(23,25,28,0.28)', dark: 'rgba(232,234,237,0.26)' },
      '--dsw-alias-tooltip-bg': { light: '#FFFFFF', dark: '#22252A' },
      '--dsw-alias-tooltip-key-bg': { light: '#F1F3F5', dark: '#34383F' },
      '--dsw-alias-toast-bg': { light: '#FFFFFF', dark: '#1C1E22' },
      '--dsw-alias-toast-label': { light: '#17191C', dark: '#E8EAED' },
      '--dsw-alias-turn-trigger-bg': { light: '#EEF0F2', dark: '#22252A' },
      '--dsw-alias-turn-trigger-bg-hover': { light: '#E8EAED', dark: '#2C2F35' },
      '--dsw-alias-switch-thumb': { light: '#FFFFFF', dark: '#E8EAED' },
      // ===== sidebar column =====
      '--dsw-specific-sidebar-fill': { light: '#F5F6F7', dark: '#17181C' },
      '--dsw-specific-sidebar-nav-item-active': { light: '#E7F0F2', dark: '#1C3B40' },
      '--dsw-specific-sidebar-nav-item-hover': { light: '#E4E7EB', dark: '#262930' },
      '--dsw-specific-sidebar-nav-item-active-accent': { light: 'rgba(40,111,120,0.10)', dark: 'rgba(92,166,176,0.18)' },
      // ===== conversation =====
      '--dsw-specific-bubble': { light: '#EEF0F2', dark: '#22252A' },
      '--dsw-specific-bubble-highlight': { light: 'rgba(40,111,120,0.10)', dark: 'rgba(92,166,176,0.16)' },
      '--dsw-specific-input-major': { light: '#FFFFFF', dark: '#1C1E22' },
      '--dsw-specific-login-input': { light: '#FFFFFF', dark: '#1C1E22' },
      '--dsw-specific-menu': { light: 'rgba(255,255,255,0.94)', dark: 'rgba(28,30,34,0.94)' },
      '--dsw-specific-selector': { light: '#EEF0F2', dark: '#22252A' },
      '--dsw-specific-tip': { light: '#6B7079', dark: '#9AA1AA' },
      // ===== diff =====
      '--dsw-alias-code-diff-added': { light: 'rgba(47,125,87,0.14)', dark: 'rgba(111,191,154,0.18)' },
      '--dsw-alias-code-diff-deleted': { light: 'rgba(185,28,28,0.14)', dark: 'rgba(240,112,103,0.18)' },
      '--dsw-alias-file-diff-added-bg': { light: 'rgba(47,125,87,0.14)', dark: 'rgba(111,191,154,0.18)' },
      '--dsw-alias-file-diff-added-gutter': { light: '#2F7D57', dark: '#6FBF9A' },
      '--dsw-alias-file-diff-added-marker': { light: '#2F7D57', dark: '#6FBF9A' },
      '--dsw-alias-file-diff-deleted-bg': { light: 'rgba(185,28,28,0.14)', dark: 'rgba(240,112,103,0.18)' },
      '--dsw-alias-file-diff-deleted-gutter': { light: '#B91C1C', dark: '#F07067' },
      '--dsw-alias-file-diff-deleted-marker': { light: '#B91C1C', dark: '#F07067' },
      // ===== DeltaUI-only roles (no Harness alias exists) =====
      // 选中文案落在 selected 底上的高对比青
      '--ens-selected-ink': { light: '#286F78', dark: '#8CC4CC' },
      // 控件边界（非文字 ≥3:1）
      '--ens-control-border': { light: '#838B92', dark: '#6B7079' },
      // 主按钮按下态
      '--ens-primary-pressed': { light: '#134C53', dark: '#6AAEB7' },
      // 禁用态文字
      '--ens-disabled': { light: '#6B7079', dark: '#9AA1AA' },
      // 遮罩与浮层阴影
      '--ens-scrim': { light: 'rgba(23,25,28,0.32)', dark: 'rgba(0,0,0,0.50)' },
      '--ens-shadow-overlay': { light: '0 8px 24px rgba(17,19,22,0.08)', dark: 'none' },
      // 语义色描边（浅底提示条用）
      '--ens-ok-line': { light: '#CFE6D6', dark: '#2C4736' },
      '--ens-warn-line': { light: '#F3D9A4', dark: '#5A4318' },
      '--ens-danger-soft': { light: '#F9E7E5', dark: '#3D2422' },
      '--ens-danger-line': { light: '#EFC6C1', dark: '#5E3330' },
    };

    /** A consistent 2px-stroke icon set for the two global nav cells. */
    const STYLESHEET = `
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
  background: transparent !important;
  color: var(--ens-accent-strong) !important;
  font-weight: 500;
  box-shadow: none !important;
  border-color: transparent !important;
}
.wnFoaW_sessionRow.wnFoaW_selected::before { display: none !important; }
/* Native session rows: preserve active-state dots, suppress only decorative idle/done dots. */
[class*="sessionRow"] [data-state="idle"],
[class*="sessionRow"] [data-state="done"] { display: none !important; }
[class*="sessionRow"] [class*="rowResting"] { margin-left: auto; }

/* HoverCard uses a hard-coded charcoal fill in the host. Follow the active
   Delta surfaces and labels for its session preview without touching other
   tooltips or popovers. */
[style*="--dsh-hover-preview-fade"] {
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-1) !important;
  color: var(--dsw-alias-label-primary);
  box-shadow: var(--dsw-elevation-panel);
}
[style*="--dsh-hover-preview-fade"] [class*="_hoverTitle"] { color: var(--dsw-alias-label-primary) !important; }
[style*="--dsh-hover-preview-fade"] [class*="_hoverPath"],
[style*="--dsh-hover-preview-fade"] [class*="_hoverTime"] { color: var(--dsw-alias-label-secondary) !important; }
[style*="--dsh-hover-preview-fade"] [class*="_hoverStatus"] { color: var(--dsw-alias-label-tertiary) !important; }
/* Keep a session's title, status and time together while retaining optional details. */
[style*="--dsh-hover-preview-fade"] [class*="_hoverContent"]:has(> [class*="_hoverStatus"]) {
  flex-direction: row; flex-wrap: wrap; align-items: center; gap: 8px;
}
[style*="--dsh-hover-preview-fade"] [class*="_hoverContent"]:has(> [class*="_hoverStatus"]) > [class*="_hoverTitle"] {
  order: 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
[style*="--dsh-hover-preview-fade"] [class*="_hoverContent"]:has(> [class*="_hoverStatus"]) > [class*="_hoverStatus"] { order: 1; white-space: nowrap; }
[style*="--dsh-hover-preview-fade"] [class*="_hoverContent"]:has(> [class*="_hoverStatus"]) > [class*="_hoverTime"] { order: 2; white-space: nowrap; }
[style*="--dsh-hover-preview-fade"] [class*="_hoverContent"]:has(> [class*="_hoverStatus"]) > [class*="_hoverPath"] { order: 3; flex-basis: 100%; }

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
/* ===== DeltaUI — design layer ===== */

/* 1 — foundation: Delta 圆角阶梯（4/8/12/16/20/28）、动效时长与缓动、焦点环 */
body {
  --dsw-radius-xs: 4px;
  --dsw-radius-sm: 8px;
  --dsw-radius-md: 12px;
  --dsw-radius-lg: 16px;
  --dsw-radius-xl: 20px;
  --dsw-radius-panel: 20px;
  --dsh-scrollbar-width: 6px;
  /* 动效规范：150/200/250ms，enter 快起慢停、exit 慢起快收 */
  --ens-dur-fast: 150ms;
  --ens-dur-base: 200ms;
  --ens-dur-slow: 250ms;
  --ens-ease-standard: cubic-bezier(0.2, 0, 0, 1);
  --ens-ease-enter: cubic-bezier(0, 0, 0, 1);
  --ens-ease-exit: cubic-bezier(0.3, 0, 1, 1);
  /* the palette publishes --ens-focus-ring inline on <body> (that is where
     the theme presenter writes tokens), so the ring colour must be resolved
     on body too — a :root declaration would not see the body's value.
     !important is required to override the host's inline --dsw-focus-ring-color
     which is set on <body> by ui-layout. */
  --dsw-focus-ring-color: var(--ens-focus-ring, #4E929C) !important;
  --ens-accent: var(--dsw-alias-state-business-primary);
  --ens-accent-soft: color-mix(in srgb, var(--dsw-alias-state-business-primary) 14%, transparent);
  --ens-accent-line: color-mix(in srgb, var(--dsw-alias-state-business-primary) 38%, transparent);
  /* 选中态底色：跟随宿主的 business-tertiary（浅 #E7F0F2 / 深 #1C3B40） */
  --ens-selected: var(--dsw-alias-state-business-tertiary);
}

/* 2 — focus, selection, motion */
/* Focus follows the reference frame: a crisp 2px ring in brand teal with a
   generous 2px gap (offset). The accent teal stays for selected / active state.
   Transition durations follow Delta motion tokens (150/200/250ms). */

:root {
  --dsw-focus-ring-width: 2px;
  --dsw-focus-ring-offset: 2px;
}
:focus-visible {
  outline-color: var(--dsw-focus-ring-color) !important;
  transition: outline-color var(--ens-dur-fast) var(--ens-ease-standard) !important;
}
/* Large containers get NO outline so a focused composer/chat never gains a
   drawn border. Small controls (inputs, buttons, search) keep the 2px teal ring
   via the global longhands above plus per-control offsets below. */
.GRgSLq_card:focus-visible,
.LOmM4q_bubble:focus-visible,
.LOmM4q_userRow:focus-visible,
.V4vHZW_column :focus-visible:not(input):not(textarea):not(button):not(select):not(a) {
  outline: none !important;
}
::selection { background: var(--ens-accent-soft); }
[data-platform=darwin] .mP3x-q_sidebarCol,
[data-windows-titlebar] .mP3x-q_sidebarCol { border-right-color: var(--dsw-alias-border-l2); }

/* 3 — sidebar column（规范正文字号 13px，桌面触控面 ≥32px） */
.wtg9ga_root { font-size: 13px; padding: 8px 10px; }
.wtg9ga_topStrip { height: 44px; }
/* v0.1.0: the logo row was a 50px empty strip, pushing the search far down. */
.wtg9ga_logoRow { height: 6px; margin-bottom: 0; }
[data-windows-titlebar] .wtg9ga_root .wtg9ga_logoRow { height: 6px; margin: 0; }
/* v0.1.0: the trajectory pane uses the conversation column's width and centring,
   so both tabs keep the same left and right gutter. */
/* v0.1.0: account balance beside the avatar, shown only when signed in. */
/* Account balances are transient avatar hints, not permanent footer text. */
._5Qcc8a_root { position: relative; }
._5Qcc8a_root[data-ens-balance]::after {
  content: attr(data-ens-balance);
  position: absolute; left: 0; bottom: calc(100% + 10px);
  z-index: 50; pointer-events: none; max-width: min(320px, 85vw);
  padding: 8px 12px; border: 1px solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-md); background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary); box-shadow: var(--dsw-elevation-soft);
  font-size: 12px; line-height: 18px; font-weight: 500; white-space: pre; opacity: 0;
  visibility: hidden; transition: opacity 120ms ease;
}
._5Qcc8a_root[data-ens-balance]:hover::after,
._5Qcc8a_root[data-ens-balance]:focus-within::after { opacity: 1; visibility: visible; }
/* v0.1.0: turn-failure detail folds to one line (foldErrors switch); click the row to expand */
html[data-ens-fold-errors] .LOmM4q_turnErrorRow { cursor: pointer; min-width: 0; }
html[data-ens-fold-errors] .LOmM4q_turnErrorRow:not([data-ens-open]) .LOmM4q_turnErrorCopy { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
html[data-ens-fold-errors] .LOmM4q_turnErrorRow:not([data-ens-open]) .LOmM4q_turnErrorTitle { flex: none; white-space: nowrap; }
html[data-ens-fold-errors] .LOmM4q_turnErrorRow:not([data-ens-open]) .LOmM4q_turnErrorMessage { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.wtg9ga_brandName { font-size: 16px; font-weight: 600; letter-spacing: 0.04em; }
/* The official brand name is a vector wordmark (BrandWordmark renders 深度求索
   as SVG paths, fill:currentColor) — there is no text node to edit. Swap the
   artwork for the Delta product name: hide the SVG, draw the label in CSS. */
.wtg9ga_brandName > svg { display: none !important; }
.wtg9ga_brandName::after {
  content: "任务执行"; display: block; white-space: nowrap;
  color: var(--dsw-alias-label-primary); font-size: 16px; font-weight: 600; letter-spacing: 0.04em;
}
.wtg9ga_newSession:active { transform: scale(0.99); }
.wtg9ga_iconButton { transition: background-color var(--ens-dur-fast) var(--ens-ease-standard), color var(--ens-dur-fast) var(--ens-ease-standard); }
.wtg9ga_iconButton:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }

/* nav rows — quiet default, Delta-style tinted active state.
   规范：列表/导航项默认无底色，悬停 surface-2，选中 selected 底 + 高对比青文字。 */
.wtg9ga_panelList { gap: 2px; }
.wtg9ga_panelRow {
  min-height: 36px; padding: 0 10px; gap: 9px; border-radius: var(--dsw-radius-md);
  color: var(--dsw-alias-label-secondary);
  transition: background-color var(--ens-dur-fast) var(--ens-ease-standard), color var(--ens-dur-fast) var(--ens-ease-standard);
}
.wtg9ga_panelRow:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.wtg9ga_panelRow.wtg9ga_panelActive {
  background: var(--dsw-specific-sidebar-nav-item-active);
  color: var(--ens-accent-strong);
  box-shadow: inset 0 0 0 1px var(--ens-accent-line);
}
.wtg9ga_panelGlyph, .wtg9ga_panelTitle { transition: color var(--ens-dur-fast) var(--ens-ease-standard); }
.wtg9ga_panelGlyph svg { display: block; }

/* 4 — session list & search (sidebar.workspaces) */
.GAkraW_sectionHeader { height: 30px; }
.GAkraW_sectionLabel { font-size: 12px; font-weight: 600; letter-spacing: 0.03em; color: var(--dsw-alias-label-caption); }
.GAkraW_iconButton { transition: background-color var(--ens-dur-fast) var(--ens-ease-standard), color var(--ens-dur-fast) var(--ens-ease-standard); }
.wnFoaW_sessionRow { height: 34px; border-radius: var(--dsw-radius-sm); }
.wnFoaW_sessionRow:not(.wnFoaW_selected):hover { background: var(--dsw-alias-interactive-bg-hover); }
.wnFoaW_title { font-size: 13px; }
.GAkraW_search { border-radius: var(--dsw-radius-md); transition: background-color var(--ens-dur-fast) var(--ens-ease-standard), box-shadow var(--ens-dur-fast) var(--ens-ease-standard); }
.GAkraW_search:focus-within {
  background: var(--dsw-alias-bg-layer-2);
}

/* 5 — conversation column & composer */
/* v0.1.0: the conversation fills the centre column (column minus the 36px gutters
   on each side), capped at 960px; past that the extra width becomes side margin.
   The user width override the host exposes still wins when set. */
.an3WzG_body { --dsh-chat-content-width: var(--dsh-chat-user-width, min(960px, max(640px, calc(var(--dsh-conversation-column-width, 0px) - 72px)))); --dsh-composer-side-clearance: 20px; }
.V4vHZW_scroll { padding: 24px calc(var(--dsh-composer-side-clearance) + 16px) 18px; }
.GRgSLq_card {
  border-radius: var(--dsw-radius-panel); padding-top: 10px; gap: 10px;
  box-shadow: var(--dsw-elevation-soft);
}
.GRgSLq_input { padding-left: 16px; }
.GRgSLq_row { padding: 2px 10px 8px; }
/* 规范 06.1：主按钮圆形 36px（桌面），悬停仅换底色，按下微缩 */
.GRgSLq_primary { width: 36px; height: 36px; border-radius: 50%; transition: background-color var(--ens-dur-fast) var(--ens-ease-standard), transform var(--ens-dur-fast) var(--ens-ease-standard); }
.GRgSLq_primary:hover:not(:disabled) { background: var(--dsw-alias-button-primary-hover); }
.GRgSLq_primary:active:not(:disabled) { transform: translateY(-2px) scale(0.96); }
.GRgSLq_add { transition: background-color var(--ens-dur-fast) var(--ens-ease-standard), transform var(--ens-dur-fast) var(--ens-ease-standard); }
.GRgSLq_add:active:not(:disabled) { transform: scale(0.94); }
.GRgSLq_select { font-weight: 500; }

/* 6 — chat content */
.V4vHZW_column { gap: 2px; }
.V4vHZW_turnSpacer { min-height: 16px; }
.LOmM4q_userRow { gap: 6px; }
.LOmM4q_bubble {
  border-radius: var(--dsw-radius-lg) var(--dsw-radius-lg) var(--dsw-radius-md) var(--dsw-radius-lg);
  padding: 10px 14px; line-height: calc(22px + var(--dsh-content-font-delta, 0px));
}
.an3WzG_body pre { border-radius: var(--dsw-radius-md); }
/* inline code & tool/IO cards: neutral fill, 12px radius, hairline border */
.an3WzG_body :not(pre) > code { border-radius: 6px; }
.hKdVjq_ioCard, .cr4P6W_ioCard, ._1h1PMq_root, .EqXNNG_body { border-radius: var(--dsw-radius-md); }
.hSzSIW_root { border-radius: var(--dsw-radius-xl); }

/* 7 — settings & plugin-manager cards */
.AnXs9G_panel { box-shadow: var(--dsw-elevation-prominent); }
.AnXs9G_header { padding: 20px 14px 8px 12px; }
.AnXs9G_navCell { transition: background-color var(--ens-dur-fast) var(--ens-ease-standard); }
.AnXs9G_navCell.AnXs9G_active { box-shadow: inset 0 0 0 1px var(--dsw-alias-border-l2); }
.AnXs9G_close { transition: background-color var(--ens-dur-fast) var(--ens-ease-standard); }
.V7pFBG_card { border-radius: var(--dsw-radius-panel); transition: background-color var(--ens-dur-fast) var(--ens-ease-standard), box-shadow var(--ens-dur-fast) var(--ens-ease-standard); }
.V7pFBG_pageTitle { font-weight: 600; }

/* 8 — reduced motion safety net */
@media (prefers-reduced-motion: reduce) {
  * { transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; }
}

/* 9 — DeltaUI chrome: compact account seat, models cleanup */
/* The brand row keeps the native 应用｜编辑 affordance out of DOM reach; it
   stays an empty drag strip, so only its layout is tuned here. */
.wtg9ga_logoRow { display: flex; align-items: center; }
.wtg9ga_toggle { order: 10; }

/* Account seat at the sidebar foot (#30): the launcher collapses to a single
   32px glyph — the host avatar when signed in, the DeepSeek Harness whale
   mark when signed out — and a right-aligned 设置 button joins it on the same
   row. The launcher row stays a React-owned node; only the button is added. */
._5Qcc8a_root { flex: none; min-width: 0; }
/* The host keeps the account launcher and footer actions in separate seats. */
.wtg9ga_footArea { display: flex; flex-direction: row; align-items: center; gap: 8px; }
.wtg9ga_settingsArea { order: 0; flex: 1 1 auto; min-width: 0; width: auto; }
.wtg9ga_settingsArea [class*="_triggerRow"] { margin: 0; }
.wtg9ga_footerActions { order: 1; display: flex; align-items: center; gap: 8px; width: auto; flex: none; }
._5Qcc8a_trigger { width: 32px !important; height: 32px !important; min-height: 32px; padding: 0 !important; justify-content: center; gap: 0; }
._5Qcc8a_label { display: none; }
._5Qcc8a_trigger[data-signed-out='true'] > svg { display: none; }
.ens-account-glyph { display: none; color: var(--dsw-alias-label-secondary); align-items: center; justify-content: center; }
/* v0.1.0: the whale mark is sized to the same 20px box as the 设置 / 登录 icons. */
.ens-account-glyph svg { width: 20px; height: 20px; display: block; }
._5Qcc8a_trigger[data-signed-out='true'] .ens-account-glyph { display: inline-flex; }
._5Qcc8a_trigger[data-signed-out=true] > svg { display: none; }
._5Qcc8a_trigger[data-signed-out=true] .ens-account-glyph { display: inline-flex; }
/* The avatar is display only; the account action lives in the footer. */
._5Qcc8a_root, ._5Qcc8a_anchor, ._5Qcc8a_trigger { pointer-events: auto !important; cursor: pointer; }
.ens-account-glyph { pointer-events: none; }
/* Keep the two host seats aligned without positioning the actions individually. */
.wtg9ga_footArea { position: relative; }
.ens-foot-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;          /* push to far right inside footerActions */
  z-index: 20;                /* above the avatar's click layer (z:10) but below modal */
  flex-shrink: 0;
}
.ens-foot-action {
  height: 28px; padding: 0 8px; border: 0; border-radius: var(--dsw-radius-md);
  background: transparent; color: var(--dsw-alias-label-secondary);
  font: inherit; font-size: 12.5px; line-height: 18px; cursor: pointer; white-space: nowrap;
  transition: background-color var(--ens-dur-fast) var(--ens-ease-standard), color var(--ens-dur-fast) var(--ens-ease-standard);
}
.ens-foot-action:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
/* Settings and account actions share the same icon target. */
.ens-foot-icon { display: inline-flex; align-items: center; box-sizing: border-box; width: 32px; height: 32px; border-radius: 50%; padding: 0 !important; justify-content: center; flex-shrink: 0; }
.ens-foot-icon svg { width: 20px; height: 20px; display: block; }
.ens-foot-icon[data-ens="settings"] { order: 1; }
.ens-foot-icon[data-ens="account"] { order: 2; }
.ens-version-action {
  display: inline-flex !important; align-items: center; justify-content: center; flex: none;
  width: 32px; height: 32px; padding: 0; margin: 0 0 0 auto; box-sizing: border-box;
  border: 0; border-radius: 50%; background: transparent; color: var(--dsw-alias-label-secondary);
}
.ens-version-action:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.ens-version-action > span:first-child { width: 20px; height: 20px; display: inline-flex; align-items: center; justify-content: center; }
.ens-version-action > span:first-child svg { width: 20px; height: 20px; }
.ens-version-action > span:not(:first-child) { display: none; }
.ens-version-action + [role="tooltip"] { color: var(--dsw-alias-label-primary); }
/* collapsed rail: the host hides the whole foot area, but 设置 must stay
   reachable (the account menu no longer offers it). Keep only that button. */
.wtg9ga_collapsed .wtg9ga_footArea { display: flex; flex-direction: column; align-items: center; }
.wtg9ga_collapsed .ens-foot-actions { flex-direction: column; align-items: center; }
.wtg9ga_collapsed .ens-foot-actions [data-ens="share"] { display: none; }
.wtg9ga_collapsed .ens-foot-action { padding: 0 6px; font-size: 12px; }
.ens-foot-notify {
  position: absolute; right: 0; bottom: calc(100% + 8px); z-index: 30;
  width: max-content; max-width: 100%; min-height: 32px; padding: 6px 10px;
  box-sizing: border-box; border: 1px solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-md); background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary); font: inherit; font-size: 12.5px; line-height: 18px;
  cursor: default; white-space: normal; display: none; align-items: center; gap: 6px;
  box-shadow: var(--dsw-elevation-soft);
}
.ens-foot-notify.visible { display: inline-flex; }
.ens-foot-notify > span { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.ens-foot-notify.error { border-color: var(--dsw-alias-state-error-primary); color: var(--dsw-alias-state-error-primary); }
.ens-foot-notify.warn { border-color: var(--dsw-alias-state-warn-primary); color: var(--dsw-alias-state-warn-primary); }
.ens-foot-notify.info { border-color: var(--dsw-alias-state-business-primary); color: var(--dsw-alias-state-business-primary); }
.ens-foot-notify .ens-foot-notify-close { flex: none; width: 16px; height: 16px; border: 0; background: transparent; color: inherit; cursor: pointer; padding: 0; line-height: 1; display: flex; align-items: center; justify-content: center; border-radius: 4px; }
.ens-foot-notify .ens-foot-notify-close:hover { background: var(--dsw-alias-interactive-bg-hover); }
.wtg9ga_collapsed .ens-foot-notify { position: fixed; left: 12px; right: auto; bottom: 60px; max-width: min(320px, calc(100vw - 24px)); }
.ens-foot-icon[data-ens="settings"] { order: 1; }
.ens-foot-icon[data-ens="account"] { order: 2; }
/* collapsed rail: the host hides the whole foot area, but 设置 must stay
   reachable (the account menu no longer offers it). Keep only that button. */
.wtg9ga_collapsed .wtg9ga_footArea { display: flex; flex-direction: column; align-items: center; }
.wtg9ga_collapsed .ens-foot-actions { flex-direction: column; align-items: center; margin-left: 0; }
.wtg9ga_collapsed .ens-foot-actions [data-ens="share"] { display: none; }
.wtg9ga_collapsed .ens-foot-action { padding: 0 6px; font-size: 12px; }

/* 10 — structure: drop the brand, reorder the sidebar, field-style search,
      legible three-column dividers, discoverable resize handles */
/* #1 the "DeepSeek Harness" brand identity is removed; the top row becomes a
      clean drag strip with just the 设置/登录 pair (the native 应用｜编辑 menu
      bar above it is out of DOM reach). */
.wtg9ga_brand { display: none !important; }

/* #2/#26 column order: the native session search sits directly ABOVE 插件管理
   (the latest placement), then 插件管理·定时任务 → 开始对话 → 工作区.
   Every block keeps one vertical rhythm. */
.wtg9ga_logoRow { order: 1; }
/* The dock reserves the room the focus ring needs: 2px ring + 2px gap on each
   side (outline-offset +2px), so a focused field can never paint over the
   工作区 row below it. 34px field + 2×(2px ring + 2px gap) + 6px breathing
   room = 46px of content, 50px of dock. */
.ens-search-dock {
  order: 2; flex: none; padding: 3px 12px 8px;
  height: 50px; max-height: 50px; box-sizing: border-box;
  overflow: hidden; isolation: isolate;
}
nav.wtg9ga_panelList { order: 3; margin-bottom: 2px; }
.wtg9ga_root > .wtg9ga_newSession,
.wtg9ga_root > *:has(> .wtg9ga_newSession) { order: 4; }
/* the host also draws its own 搜索 Ctrl+K affordance inside the section header;
   the dock owns the only search entry now. */
/* the dock owns its own focus treatment: the ring is drawn *inside* the field
   (outline-offset -2px), so a focused search can never paint over the row
   below it — and the dock clips anything that tries. */
.ens-search-dock .GAkraW_clearButton:focus-visible { outline: none; }
.ens-search-dock .GAkraW_clearButton {
  border-radius: 50%; width: 18px; height: 18px; color: var(--dsw-alias-label-tertiary);
}
.ens-search-dock .GAkraW_clearButton:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
/* collapsed: the host gives the input flex:1, which in a full-width field
   would stretch it and push our ::after label to the far right edge — keep
   the input zero-width until the field expands. */
.ens-search-dock .GAkraW_searchInput { font-size: 13px; flex: none; width: 0; }
.wtg9ga_regionArea { order: 5; }
.wtg9ga_footArea { order: 6; }

/* #2/#13 restyle 新会话 (→开始对话) as a panel row identical to 定时任务:
      same box (min-height/padding/gap), same inset, flush-left content. The
      shipped button centres its content at 100cqw with a gradient mask for the
      shortcut hint; override both so it reads as a left-aligned nav row. */
.wtg9ga_newSession {
  height: auto; min-height: 36px; margin: 0 2px; border: 0; border-radius: var(--dsw-radius-md);
  background: transparent; color: var(--dsw-alias-label-secondary);
  justify-content: flex-start; align-items: center; gap: 9px;
  padding: 0 10px; font: inherit; font-weight: 400; text-align: left; position: relative;
  transition: background-color var(--ens-dur-fast) var(--ens-ease-standard), color var(--ens-dur-fast) var(--ens-ease-standard);
}
[data-windows-titlebar] .wtg9ga_root:not(.wtg9ga_collapsed) .wtg9ga_newSession { margin: 0 2px 8px; }
.wtg9ga_newSession:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.wtg9ga_newSessionLabelMask { flex: none; min-width: 0; mask-image: none !important; -webkit-mask-image: none !important; }
.wtg9ga_newSessionContent { justify-content: flex-start; align-items: center; gap: 9px; width: auto; }
.wtg9ga_newSession svg { width: 16px; height: 16px; flex: none; }
.wtg9ga_newSessionLabel { font-size: 13px; font-weight: 400; max-width: none; white-space: nowrap; }
.wtg9ga_newSessionShortcut { display: none !important; }

/* #4/#15 the workspace search slot is relocated into a dock above 插件管理 and
      presented as a full-width field. The shipped slot is clamped at
      max-width:28px (icon-only) — remove the clamp so it fills the dock.

      KEY: the FIELD is the host's .GAkraW_search container (it owns the click
      handler and the expansion state); the .GAkraW_searchButton inside it is
      only the magnifier glyph. The previous version styled the button as the
      field (width:100% + a ::after label), which squeezed the expanded
      .GAkraW_searchInput to zero width — so a click expanded the state but
      showed nothing, reading as "click does nothing". Styling the container
      as the field fixes both the collapsed look and the expansion. */
.ens-search-dock .GAkraW_searchSlot {
  width: 100%; max-width: none; flex: none; margin-left: 0; padding-left: 0; transition: none;
}
/* 规范：搜索/输入字段高 36px、圆角 12px（md），描边 control 色 */
.ens-search-dock .GAkraW_search {
  width: 100%; height: 36px; border-radius: var(--dsw-radius-md); gap: 8px; padding: 0 10px;
  border: 1px solid var(--dsw-alias-border-l3); background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-tertiary);
  transition: border-color var(--ens-dur-fast) var(--ens-ease-standard), background-color var(--ens-dur-fast) var(--ens-ease-standard), color var(--ens-dur-fast) var(--ens-ease-standard);
}
.ens-search-dock .GAkraW_search:hover {
  border-color: var(--dsw-alias-border-l3); background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-secondary);
}
/* the placeholder label lives on the container so the expanded input has
   room next to the glyph; drop it the moment the field expands. The text comes
   from data-ens-placeholder, which JS writes per document language — the same
   string also lands on the real input, so focus and expansion agree. */
.ens-search-dock .GAkraW_search::after {
  content: attr(data-ens-placeholder); font-size: 13px; line-height: 18px; color: var(--dsw-alias-label-caption);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ens-search-dock .GAkraW_searchButton {
  width: 16px; height: 16px; flex: none; border-radius: 0;
}
.ens-search-dock .GAkraW_searchButton:hover { background: transparent; }
/* Focus: 规范输入框聚焦 = 描边换焦点环色。参考帧把环画在字段外侧并留 2px 间隙，
   dock 已预留该空间（padding + 高度），否则 overflow:hidden 会切断环。 */
/* v0.2.0: 聚焦为字段上 1px 品牌青描边（规范参考外观），无外环；轨迹搜索同处理。 */
.ens-search-dock .GAkraW_search:focus-visible,
.ens-search-dock .GAkraW_search:focus-within,
.ens-search-dock .GAkraW_searchExpanded:focus-within,
.Wd4N7W_search:focus-visible,
.Wd4N7W_search:focus-within {
  outline: none !important;
  border-color: var(--ens-focus-ring) !important;
  box-shadow: none;
}
/* the host hides 工作区 and its header actions while the search is expanded;
   keep them visible so the expanded field never blanks the header row. */
.GAkraW_sectionLabelHidden,
.GAkraW_headerActionsHidden {
  opacity: 1 !important; visibility: visible !important; max-width: none !important;
  transform: none !important; pointer-events: auto !important; transition: none !important;
}
/* expanded: the host swaps .GAkraW_search for .GAkraW_searchExpanded (same
   node, added class). Normalise width/height/margins so it fills the dock,
   drop our placeholder label, and let the input take the remaining flex. */
.ens-search-dock .GAkraW_searchExpanded {
  width: 100%; height: 36px; margin-inline: 0; border-radius: var(--dsw-radius-md);
  border: 1px solid var(--dsw-alias-border-l3); background: var(--dsw-alias-bg-layer-1);
  padding: 0 10px; gap: 8px;
}
.ens-search-dock .GAkraW_searchExpanded::after { content: none; }
.ens-search-dock .GAkraW_searchExpanded .GAkraW_searchButton { width: 16px; height: 16px; }
.ens-search-dock .GAkraW_searchExpanded .GAkraW_searchInput {
  opacity: 1; pointer-events: auto; flex: 1 1 auto; width: auto; min-width: 0;
}

/* #14 the 工作区 label stays flush-left while 视图选项 / 添加工作区 stay
      flush-right. With the search slot moved out, the header is just label +
      actions; pin them to opposite edges and match the panel-row inset. */
.GAkraW_sectionHeader { justify-content: flex-start; padding-left: 6px; margin-right: 0; }
.GAkraW_sectionLabel { margin-right: auto; }
.GAkraW_headerActions { margin-left: auto; flex: none; }
/* the host's search slot is relocated into the dock above 插件管理; while it
   still sits in the workspace header (before the observer moves it, or when
   React re-creates it there) it stays invisible — the dock shows the real one. */
.ens-search-dock .GAkraW_searchSlot { opacity: 1; pointer-events: auto; }
.GAkraW_sectionHeader .GAkraW_searchSlot { opacity: 0 !important; pointer-events: none !important; }

/* #10 the center column shares bg-base with the rightbar; give the side panels a
      shared "panel" surface and a crisp hairline so the three columns read. */
.mP3x-q_sidebarCol { border-right: 1px solid var(--dsw-alias-border-l2) !important; }
.mP3x-q_rightbarCol { background: var(--dsw-specific-sidebar-fill); border-left: 1px solid var(--dsw-alias-border-l2); }

/* #7 the resize handles already exist (sidebar 264–420px, rightbar resizable,
      center minmax(400px,1fr)); surface them with a hover line. */
.mP3x-q_handle { background: transparent; }
.mP3x-q_handle::after {
  content: ""; position: absolute; top: 0; bottom: 0; left: 3px; right: 3px;
  border-radius: 2px; background: transparent; transition: background-color var(--ens-dur-fast) var(--ens-ease-standard);
}
.mP3x-q_handle:hover::after { background: var(--dsw-alias-border-l3); }
.mP3x-q_handle[data-dragging]::after { background: var(--dsw-alias-state-business-primary); }

/* 11 — conversation view-tab row (#13): 对话 / 轨迹 / 刷过的视频 share one
      baseline, one inset and one rhythm. The tab row was indented 8px past the
      session title and spaced at 32px (vs the header's 20px rhythm); normalise
      so the first tab aligns with the title and every tab keeps an equal step. */
.an3WzG_tabs { padding-left: 0; column-gap: 12px; }
.an3WzG_viewTabs { gap: 24px; align-items: center; }
.an3WzG_tab { padding-bottom: 10px; }
.an3WzG_tabLabel { max-width: none; }

/* 12 — better-sidebar workbench (#16) + ModLens card (#17). Both bundles are
      fully token-driven (1047 --dsw-* refs), so the Delta palette recolours
      them automatically; DeltaUI only adds its motion rhythm, radii and the
      tinted active state so the workbench reads as one design system. */
.nArs4W_tab,
.nArs4W_tabClose,
.nArs4W_tabBarPlus,
.nArs4W_explorerRow { transition: background-color var(--ens-dur-fast) var(--ens-ease-standard), color var(--ens-dur-fast) var(--ens-ease-standard); }
.nArs4W_tab { border-radius: var(--dsw-radius-sm); }
.nArs4W_tabActive {
  background: var(--dsw-specific-sidebar-nav-item-active);
  color: var(--ens-accent-strong);
  box-shadow: inset 0 -2px 0 0 var(--dsw-alias-state-business-primary);
}
.nArs4W_explorerRowSelected:before { border-radius: 2px; }
.nArs4W_chipUnread { background: var(--dsw-alias-state-business-primary); }
.nArs4W_bottomPanel { border-radius: var(--dsw-radius-panel) var(--dsw-radius-panel) 0 0; }
/* ModLens vision card uses the native plugin-card chrome and ui.Input, so it
      already follows Delta tokens; give its focus state the DeltaUI accent. */
.V7pFBG_card input:focus-visible,
.V7pFBG_card select:focus-visible,
.V7pFBG_card button:focus-visible {
  outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color) !important;
  outline-offset: var(--dsw-focus-ring-offset) !important;
  box-shadow: none;
}

/* Reserve the live indicator's slot even when no job is running. */
.Ag-ohG_trigger:not(:has(.Ag-ohG_triggerDot))::before { content: ''; width: 10px; height: 10px; flex: none; }
.Ag-ohG_count {
  white-space: nowrap;
  flex: none;
}

/* 13 — #31 conversation header: header actions sit flush-right (work mode +
       job count), the conversation name takes the remaining space and truncates
       with an ellipsis instead of pushing actions off-screen. */
.an3WzG_headerActions { order: 1; margin-left: auto; flex: none; column-gap: 12px !important; }
.an3WzG_crumbSeg { min-width: 0; overflow: hidden; }
.an3WzG_crumbCurrent { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
/* inside the header actions the background-job count leads the work-mode chip */
.an3WzG_headerActions > :has(.Ag-ohG_count) { order: -20 !important; }

/* 14 — #3 unify secondary and deeper pages (设置 → 模型/账户/通用, 插件管理详情).
      Those pages ship their own CSS modules; pin them to the same card, title,
      body, input and button cadence as the rest of Delta so drilling in never
      changes the visual system. */
.jrmgQW_section { gap: 14px; }
.jrmgQW_title { font-size: 15px; font-weight: 600; line-height: 22px; letter-spacing: -0.01em; }
.jrmgQW_intro { font-size: 13px; line-height: 20px; }
.jrmgQW_rows { gap: 10px; margin-top: 14px; }
.jrmgQW_rowCard,
.V7pFBG_card { border-radius: var(--dsw-radius-panel); border-color: var(--dsw-alias-border-l2); padding: 14px 16px; gap: 12px; }
.jrmgQW_rowName { font-size: 13px; font-weight: 500; }
.jrmgQW_rowTag { border-radius: 6px; }
/* 规范 06.1：次要按钮高 32px 圆角 8px；输入框高 36px 圆角 12px，描边用控件边界 l3（≥3:1） */
.jrmgQW_input,
.jrmgQW_selectInput,
.jrmgQW_keyInput { border-radius: var(--dsw-radius-md); border-color: var(--dsw-alias-border-l3); min-height: 36px; font-size: 13px; }
.jrmgQW_input:focus-visible,
.jrmgQW_selectInput:focus-visible,
.jrmgQW_keyInput:focus-visible {
  outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color) !important;
  outline-offset: var(--dsw-focus-ring-offset) !important;
  border-color: var(--dsw-alias-border-l3);
  box-shadow: none;
}
.jrmgQW_primaryButton,
.jrmgQW_secondaryButton,
.jrmgQW_addButton,
.jrmgQW_dangerButton { border-radius: var(--dsw-radius-sm); min-height: 32px; font-size: 13px; }
.jrmgQW_editor,
.jrmgQW_addCard,
.jrmgQW_addPanel { border-radius: var(--dsw-radius-lg); }
/* Settings stays a floating popup, as the host ships it: Ctrl+, opens the
   centred [data-shortcut-modal="settings"] card. No full-page overrides here. */
.jrmgQW_editorHeader { padding-bottom: 8px; }

/* 14b — deep form controls on host settings pages (2nd / 3rd level jrmgQW pages).
       Matched by module namespace so every field inside these pages takes the same
       treatment whatever its own class. */
[class*="jrmgQW_"] :is(input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=button]):not([type=submit]):not([type=reset]), select) {
  box-sizing: border-box; min-height: 36px; padding: 0 12px;
  border: 1px solid var(--ens-control-border); border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary);
  font-size: 13px; line-height: 20px; box-shadow: none;
}
[class*="jrmgQW_"] select { padding-right: 32px; }
[class*="jrmgQW_"] textarea {
  box-sizing: border-box; min-height: 72px; padding: 8px 12px;
  border: 1px solid var(--ens-control-border); border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary);
  font-size: 13px; line-height: 20px; box-shadow: none;
}
[class*="jrmgQW_"] :is(input, textarea, select)::placeholder { color: var(--dsw-alias-label-tertiary); opacity: 1; }
[class*="jrmgQW_"] :is(input, textarea, select):disabled {
  background: var(--dsw-alias-bg-layer-2); border-color: var(--dsw-alias-border-l1); color: var(--ens-disabled);
}
/* options inside native select popups */
[class*="jrmgQW_"] select option { background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); }
[class*="jrmgQW_"] select option:checked,
[class*="jrmgQW_"] select option:hover { background: var(--ens-selected); color: var(--ens-selected-ink); }
[class*="jrmgQW_"] label { font-size: 13px; line-height: 20px; font-weight: 500; color: var(--dsw-alias-label-primary); }
[class*="jrmgQW_"] [role="tablist"] { gap: 4px; }
[class*="jrmgQW_"] [role="tab"] { min-height: 32px; font-size: 14px; line-height: 22px; font-weight: 500; border-radius: var(--dsw-radius-sm); }
[class*="jrmgQW_"] [role="tab"][aria-selected="true"] { background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); }

/* design-layer dropdown list (rows 34px, radius 10 for list items / 16 for panel,
   per spec 06.6). Menus mounted by JS open on the host's native selects. */
.ens-menu {
  position: fixed; z-index: 2147483000; box-sizing: border-box; padding: 4px;
  max-height: 280px; overflow-y: auto; display: flex; flex-direction: column; gap: 2px;
  border: 1px solid var(--dsw-alias-border-l2); border-radius: var(--dsw-radius-lg);
  background: var(--dsw-alias-bg-layer-1); box-shadow: var(--ens-shadow-overlay);
}
.ens-menu-item {
  flex: none; display: flex; align-items: center; height: 34px; padding: 0 10px; box-sizing: border-box;
  border-radius: 10px; color: var(--dsw-alias-label-primary); font-size: 13px; line-height: 20px;
  cursor: pointer; user-select: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  transition: background-color var(--ens-dur-fast) var(--ens-ease-standard), color var(--ens-dur-fast) var(--ens-ease-standard);
}
.ens-menu-active { background: var(--dsw-alias-interactive-bg-hover-solid); }
.ens-menu-item[aria-selected="true"] { background: var(--ens-selected); color: var(--ens-selected-ink); font-weight: 500; }
.ens-menu-item[aria-selected="true"].ens-menu-active { background: var(--dsw-alias-state-business-tertiary); }

/* motion: surfaces ease in (fade only, no rise — keeps weight equal to a page
   change); exits are instant because the host unmounts them. Reduced motion keeps
   the fades only. */
@keyframes ensFade { from { opacity: 0; } to { opacity: 1; } }
[data-radix-popper-content-wrapper] > *, [role="menu"], [role="listbox"], [class*="_card_38jqx_"] {
  animation: ensFade var(--ens-dur-fast) var(--ens-ease-standard) both;
}
@media (prefers-reduced-motion: no-preference) {
  /* bubble card rise-in for the workbench card class when present */
  [data-radix-popper-content-wrapper] > *, [role="menu"], [role="listbox"], [class*="_card_38jqx_"] {
    animation: ensFade var(--ens-dur-fast) var(--ens-ease-standard) both;
  }
}

/* segmented controls (工作/常规) — replace the host's stroke+shadow indicator
   with a Delta hairline; pointer focus shows no ring on the tabs. */
[class*="_indicator_d62eq_"] { box-shadow: inset 0 0 0 1px var(--dsw-alias-border-l2) !important; }
html[data-input-modality="pointer"] [class*="_tab_d62eq_"]:focus-visible { outline: none !important; }

/* settings window: keep the dim, drop the host's full-page mask blur (it re-samples
   the whole page on every open frame); the panel fades in without moving. */
.AnXs9G_mask { backdrop-filter: none !important; }
.AnXs9G_panel { will-change: opacity; animation: ensFade 140ms ease-out both; }
/* settings panel resizable from its bottom-right corner (host fixes it at 800px) */
.ens-resize {
  position: absolute; right: 6px; bottom: 6px; width: 20px; height: 20px;
  cursor: nwse-resize; display: flex; align-items: center; justify-content: center;
  border-radius: 4px; color: var(--dsw-alias-label-tertiary);
}
.ens-resize:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.ens-resize svg { width: 14px; height: 14px; display: block; }

/* 15 — #27 the Delta UI settings module: one row per feature, semantic names,
      a persisted switch, and an explicit 规划中 badge so nothing is a placebo. */
.ens-settings { display: flex; flex-direction: column; gap: 16px; max-width: 720px; }
.ens-set-head { display: flex; flex-direction: column; gap: 4px; }
.ens-set-title { font-size: 16px; font-weight: 600; line-height: 24px; color: var(--dsw-alias-label-primary); }
.ens-set-sub { font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-tertiary); }
.ens-set-list { display: flex; flex-direction: column; gap: 8px; }
.ens-set-row {
  display: flex; align-items: center; gap: 16px; justify-content: space-between;
  padding: 12px 14px; border-radius: var(--dsw-radius-md);
  border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-1);
  transition: border-color var(--ens-dur-fast) var(--ens-ease-standard);
}
.ens-set-row:hover { border-color: var(--dsw-alias-border-l3); }
.ens-set-row-planned { opacity: .74; }
.ens-set-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.ens-set-name { font-size: 13px; font-weight: 500; color: var(--dsw-alias-label-primary); }
.ens-set-en { font-size: 11.5px; color: var(--dsw-alias-label-caption); }
.ens-set-desc { font-size: 12.5px; line-height: 18px; color: var(--dsw-alias-label-tertiary); }
.ens-set-side { display: flex; flex: none; align-items: center; gap: 8px; }
/* 规范 06.4 开关：44×24，开启品牌青，关闭 #D9DDE2（control 描边色），拇指 18px */
.ens-switch {
  position: relative; flex: none; width: 44px; height: 24px; padding: 3px;
  border: 0; border-radius: 999px; background: var(--dsw-alias-border-l2);
  cursor: pointer; display: inline-flex; align-items: center;
  transition: background-color var(--ens-dur-fast) var(--ens-ease-standard);
}
.ens-switch:disabled { cursor: not-allowed; opacity: .55; }
.ens-switch-on { background: var(--dsw-alias-state-business-primary); }
.ens-switch-knob {
  width: 18px; height: 18px; border-radius: 50%; background: var(--dsw-alias-switch-thumb);
  box-shadow: 0 1px 2px rgba(0,0,0,.18);
  transition: transform var(--ens-dur-fast) var(--ens-ease-standard);
}
.ens-switch-on .ens-switch-knob { transform: translateX(20px); }
.ens-plan-tag { font-size: 10.5px; line-height: 16px; color: var(--dsw-alias-label-caption); white-space: nowrap; }
.ens-privacy {
  display: flex; flex-direction: column; gap: 4px; padding: 12px 14px;
  border-radius: var(--dsw-radius-lg); border: 1px dashed var(--dsw-alias-border-l3);
}
.ens-privacy-title { font-size: 13px; font-weight: 600; color: var(--dsw-alias-label-primary); }
.ens-privacy-body { font-size: 12.5px; line-height: 19px; color: var(--dsw-alias-label-tertiary); }
.ens-provider-list { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; }
.ens-provider { display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; border-radius: var(--dsw-radius-md); border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-1); }
.ens-provider-head { display: flex; align-items: center; gap: 8px; }
.ens-provider-name { flex: 1; min-width: 0; }
.ens-provider .ens-set-name { font-size: 12.5px; font-weight: 500; color: var(--dsw-alias-label-secondary); margin-bottom: 2px; }

/* 16 — #20 selectionAnnotation: a floating 批注 pill on a text selection, and a
      compact composer popover. Both opt into the soft ring, never a hard frame. */
.ens-anno-btn {
  position: fixed; z-index: 2147483000; display: inline-flex; align-items: center; gap: 5px;
  height: 32px; padding: 0 12px; border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 999px; background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary); font: inherit; font-size: 12.5px; line-height: 18px;
  box-shadow: var(--dsw-elevation-soft); cursor: pointer;
}
.ens-anno-btn:hover { border-color: var(--dsw-alias-border-l3); background: var(--dsw-alias-interactive-bg-hover); }
.ens-anno-panel {
  position: fixed; z-index: 2147483000; width: 300px; padding: 10px;
  display: flex; flex-direction: column; gap: 8px;
  border: 1px solid var(--dsw-alias-border-l2); border-radius: var(--dsw-radius-lg);
  background: var(--dsw-alias-bg-layer-1); box-shadow: var(--dsw-elevation-prominent);
}
.ens-anno-quote {
  max-height: 64px; overflow: auto; padding-left: 8px; border-left: 2px solid var(--ens-accent-line);
  font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-tertiary);
}
.ens-anno-input {
  width: 100%; min-height: 64px; resize: vertical; padding: 8px 10px; box-sizing: border-box;
  border: 1px solid var(--dsw-alias-border-l2); border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary);
  font: inherit; font-size: 13px; line-height: 20px;
}
.ens-anno-input:focus-visible {
  outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color) !important;
  outline-offset: var(--dsw-focus-ring-offset) !important;
  border-color: var(--dsw-alias-border-l3);
  box-shadow: none;
}
.ens-anno-actions { display: flex; justify-content: flex-end; gap: 8px; }
.ens-anno-primary, .ens-anno-ghost {
  height: 32px; padding: 0 12px; border-radius: var(--dsw-radius-sm); font: inherit; font-size: 13px; cursor: pointer;
  transition: background-color var(--ens-dur-fast) var(--ens-ease-standard), border-color var(--ens-dur-fast) var(--ens-ease-standard);
}
.ens-anno-primary { border: 0; background: var(--dsw-alias-state-business-primary); color: var(--dsw-alias-bg-base); }
.ens-anno-primary:hover { background: var(--dsw-alias-button-primary-hover); }
.ens-anno-primary:active { background: var(--ens-primary-pressed); }
.ens-anno-ghost { border: 1px solid var(--dsw-alias-border-l2); background: transparent; color: var(--dsw-alias-label-secondary); }
.ens-anno-ghost:hover { background: var(--dsw-alias-interactive-bg-hover); }
.ens-anno-ghost:active { background: var(--dsw-alias-interactive-bg-active); }
.ens-anno-chip {
  position: fixed; z-index: 2147483000; left: 50%; transform: translateX(-50%); bottom: 150px;
  height: 32px; padding: 0 12px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 999px;
  background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-secondary);
  font: inherit; font-size: 12.5px; box-shadow: var(--dsw-elevation-soft); cursor: pointer;
}

/* ===== v1.0.2 — standalone settings modal (the guaranteed fallback) ===== */
.ens-foot-action-busy { opacity: .55; }
.ens-modal-backdrop {
  position: fixed; inset: 0; z-index: 20000;
  background: rgba(15, 20, 25, 0.52);
  display: flex; align-items: center; justify-content: center; padding: 24px;
}
.ens-modal-card {
  width: min(720px, 94vw); max-height: 88vh;
  display: flex; flex-direction: column;
  border-radius: 16px; border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-1);
  box-shadow: 0 20px 48px rgba(0, 0, 0, 0.24); overflow: hidden;
}
.ens-modal-card .ens-settings { max-width: none; padding: 4px 24px 12px; overflow-y: auto; }
.ens-modal-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 20px 24px 12px; }
.ens-modal-title { font-size: 17px; font-weight: 600; line-height: 24px; color: var(--dsw-alias-label-primary); }
.ens-modal-sub { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-tertiary); margin-top: 2px; }
.ens-modal-banner {
  margin: 0 24px; padding: 10px 12px; border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-state-warn-tertiary); color: var(--dsw-alias-label-secondary);
  font-size: 12.5px; line-height: 19px;
}
.ens-pill-btn {
  height: 32px; padding: 0 12px; border-radius: var(--dsw-radius-sm); flex: none;
  border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-secondary); font: inherit; font-size: 13px; font-weight: 500;
  cursor: pointer; display: inline-flex; align-items: center; gap: 5px; white-space: nowrap;
  transition: background-color var(--ens-dur-fast) var(--ens-ease-standard), border-color var(--ens-dur-fast) var(--ens-ease-standard), color var(--ens-dur-fast) var(--ens-ease-standard);
}
.ens-pill-btn:hover {
  border-color: var(--dsw-alias-border-l3);
  background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary);
}
.ens-pill-btn:active { background: var(--dsw-alias-interactive-bg-active); }
.ens-pill-btn:disabled { opacity: .5; cursor: not-allowed; }
/* a pill button inside a column keeps its own width, not the full row */
.ens-privacy > .ens-pill-btn { align-self: flex-start; margin-top: 4px; }
.ens-pill-btn-primary { border-color: var(--dsw-alias-state-business-primary); color: var(--dsw-alias-state-business-primary); }
.ens-diag-box {
  margin: 0 24px 16px; padding: 10px 12px; border: 1px dashed var(--dsw-alias-border-l2); border-radius: 10px;
  background: var(--dsw-alias-bg-layer-2);
  font: 11.5px/1.7 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  color: var(--dsw-alias-label-secondary); white-space: pre-wrap; word-break: break-all;
  max-height: 168px; overflow: auto;
}
`;

    return {
      inject: ['theme', 'slots'],
      apply(ctx: HarnessClientContext) {
        // Every contribution is defensive: a failure here degrades the refresh
        // (no palette / no stylesheet) and must never abort the web boot.
        try { console.info('[dsh-ui-delta] Delta UI loaded'); } catch { /* ignore */ }
        try {
          ctx.effect(() => ctx.theme.overrideTokens(SOURCE, PALETTE), 'dsh-ui-delta: palette layer');
        } catch (error) {
          console.warn('[dsh-ui-delta] palette layer unavailable:', error);
        }

        try {
          ctx.effect(() => {
            if (typeof document === 'undefined') return;
            const tag = document.createElement('style');
            tag.dataset.plugin = SOURCE;
            tag.dataset.pluginCss = `${SOURCE}/design-layer`;
            tag.textContent = STYLESHEET;
            document.head.appendChild(tag);
            return () => { tag.remove(); };
          }, 'dsh-ui-delta: design layer');
        } catch (error) {
          console.warn('[dsh-ui-delta] design layer unavailable:', error);
        }

        try {
          ctx.effect(() => {
            if (typeof document === 'undefined') return;

            // Line icons (2px stroke, currentColor) for the top action row.
            const ICON_SETTINGS =
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
              'stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"/>' +
              '<path d="M19.4 13.5a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
            const ICON_LOGIN =
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
              'stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="3.5"/>' +
              '<polyline points="12 8 16 12 12 16"/><line x1="7.5" y1="12" x2="16" y2="12"/></svg>';
            // v0.1.0: the matching sign-out glyph (arrow leaving the box).
            const ICON_LOGOUT =
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
              'stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="3.5"/>' +
              '<polyline points="12 8 8 12 12 16"/><line x1="16.5" y1="12" x2="8" y2="12"/></svg>';
            const ICON_PERSON =
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
              'stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>' +
              '<circle cx="12" cy="7" r="4"/></svg>';
            const ICON_WORKBENCH =
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
              'stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l2-5h14l2 5"/>' +
              '<path d="M3 9v11h18V9"/><path d="M9 13h6"/></svg>';
            const ICON_SHARE =
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
              'stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/>' +
              '<polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>';

            // #24 conversationShare (ready): copy the visible conversation as
            // Markdown. Reads the conversation column's text rather than a slot
            // because the export is a one-shot snapshot, not a rendered view.
            const copyConversation = async (btn: HTMLElement | null) => {
              const col = (document.querySelector<HTMLElement>('.V4vHZW_column')
                || document.querySelector<HTMLElement>('[data-conversation-scroll]')) as HTMLElement | null;
              const text = (col && col.innerText ? col.innerText : '').trim();
              if (!text) return;
              const md = '# 对话记录\n\n' + text + '\n';
              try {
                await navigator.clipboard.writeText(md);
                if (btn) {
                  const label = btn.querySelector<HTMLElement>('span');
                  if (label) {
                    const old = label.textContent;
                    label.textContent = '已复制';
                    setTimeout(() => { label.textContent = old; }, 1200);
                  }
                }
              } catch (error) {
                console.warn('[dsh-ui-delta] clipboard unavailable:', error);
              }
            };

            // #16 BetterSidebar integration: open its file-explorer page in the
            // native right sidebar. The service is accessed defensively (never
            // declared in `inject`) so removing dsh-better-sidebar can never
            // take DeltaUI down with it; a DOM toggle is the fallback.
            const openWorkbench = () => {
              try {
                const svc = ctx && ctx.betterSidebar;
                if (svc && typeof svc.openTab === 'function') { svc.openTab({ type: 'explorer' }); return; }
              } catch { /* not provided to this fiber — fall through */ }
              const t = document.querySelector<HTMLElement>('.nArs4W_toggleButton, .nArs4W_dockFallback button, .nArs4W_dockFallback') as HTMLElement | null;
              t?.click?.();
            };

            // Host action resolvers — read lazily at click time so the slots are
            // guaranteed registered, and degrade to DOM clicks if the shape drifts.
            const slots = () => (typeof ctx.slots === 'object' && ctx.slots) as HarnessClientContext['slots'] | null;
            // v1.0.2: the reader is discovered from the live service instead of
            // assumed. entriesOfSlot()/entries() were guesses; if the real host
            // names its reader differently every slot-based action silently
            // emptied and the button degraded to pure DOM paths. Both method
            // shapes and map shapes are probed — read-only, each guarded, and
            // only entry-looking objects are harvested, so a mismatched reader
            // can never feed a foreign object into the action probes.
            const SLOT_READER_KEYS = ['entriesOfSlot', 'entries', 'slotEntries', 'get', 'getSlot', 'ofSlot', 'slot'];
            interface SlotEntry {
  id?: string;
  name?: string;
  inject?: () => unknown;
  options?: { inject?: () => unknown; store?: SlotStore };
  store?: SlotStore;
  [key: string]: unknown;
}

interface LauncherOps {
  inject?: () => unknown;
  options?: { inject?: () => unknown };
  start?: () => unknown;
  open?: () => unknown;
  openSettings?: () => unknown;
  hooks?: {
    account?: {
      getSnapshot?: () => {
        view?: { status?: string };
        details?: { balance?: { status?: string; value?: Array<{ currency?: string; balance?: string | number }>; bonusWallets?: Array<{ currency?: string; balance?: string | number }> } };
      };
      subscribe?: (cb: () => void) => unknown;
    };
  };
  [key: string]: unknown;
}

interface SlotStore {
  getState?: () => { actions?: { open?: () => unknown } };
  open?: () => unknown;
  create?: () => { actions?: { open?: () => unknown } };
}

const looksLikeEntry = (v: unknown): v is SlotEntry => !!v && typeof v === 'object' && !Array.isArray(v)
              && ('id' in v || 'name' in v || 'inject' in v || 'options' in v || 'store' in v);
            const slotEntries = (name: string): SlotEntry[] => {
              const s = slots();
              if (!s) return [];
              const out: SlotEntry[] = [];
              const call = (fn: () => unknown) => { try { return fn(); } catch { return undefined; } };
              const harvest = (r: unknown) => {
                if (!r) return false;
                if (Array.isArray(r)) { r.forEach((v) => { if (looksLikeEntry(v)) out.push(v); }); return out.length > 0; }
                if (typeof r !== 'object') return false;
                const rObj = r as Record<string, unknown>;
                const arr = Array.isArray(rObj.entries) ? rObj.entries
                  : Array.isArray(rObj[name]) ? rObj[name]
                  : Array.isArray(rObj.items) ? rObj.items : null;
                if (arr) { arr.forEach((v) => { if (looksLikeEntry(v)) out.push(v); }); return out.length > 0; }
                if (looksLikeEntry(r)) { out.push(r); return true; }
                return false;
              };
              for (const key of SLOT_READER_KEYS) {
                const reader = (s as Record<string, unknown>)[key];
                if (typeof reader !== 'function') continue;
                const result = call(() => (reader as (n: string) => unknown)(name));
                if (harvest(result)) return out;
                out.length = 0;
              }
              for (const holder of [s, s.slots, s.registry, s.map, s.definitions]) {
                if (!holder) continue;
                const v = (holder as Record<string, unknown>)[name];
                if (Array.isArray(v)) v.forEach((e) => { if (looksLikeEntry(e)) out.push(e); });
                else if (looksLikeEntry(v)) out.push(v);
                if (out.length) return out;
                out.length = 0;
              }
              return out;
            };
            let opsCache: LauncherOps | null = null; // `inject: () => operations` returns a stable object
            const launcherOps = (): LauncherOps | null => {
              if (opsCache) return opsCache;
              try {
                const e = slotEntries('settings.launcher')[0];
                opsCache = (e?.inject?.() ?? e?.options?.inject?.() ?? null) as LauncherOps | null;
              } catch { opsCache = null; }
              return opsCache;
            };
            // Open the settings surface. v1.0.2 rebuilds the chain around
            // three failures of v1.0.1:
            //  1. silent dead end — when no level matched, the click did
            //     nothing at all. A guaranteed final level now opens the
            //     built-in Delta settings modal (restored from the 0.1.x
            //     lineage), so the button always answers.
            //  2. assumed APIs — the slot reader and the store shapes were
            //     guesses. The reader is now runtime-discovered, store.create()
            //     is retried last and verified (the v1.0.0 bug was the
            //     unverified early return, not the call), and sibling host
            //     packages are probed for an open()-style export.
            //  3. no observability — every level records what it found and did
            //     into a diagnostic (window.__ensDiag, console, and a copy
            //     button inside the fallback modal), so a host that still
            //     refuses can be pinpointed from the next report.
            const SETTINGS_OPEN_SEL = [
              '[data-shortcut-modal="settings"]',
              '.AnXs9G_panel',
              '[class*="_settingsPanel"]',
              '[class*="_settingsPage"]',
              '.ens-standalone-settings-modal',
            ].join(', ');
            // The running diagnostic: which APIs the host really exposes, what
            // the DOM looked like, and what every level tried. Exposed on
            // window.__ensDiag and rendered inside the fallback modal.
            const DIAG = {
              version: '',
              ua: '',
              url: '',
              slotsApi: [] as string[],
              dom: {} as Record<string, unknown>,
              moduleProbe: [] as unknown[],
              attempts: [] as string[],
            };
            try { DIAG.ua = String(navigator.userAgent || '').slice(0, 140); } catch { /* ignore */ }
            try { window.__ensDiag = DIAG; } catch { /* ignore */ }
            const note = (level: string, msg: string) => { DIAG.attempts.push(`[${level}] ${msg}`); };
            // A dialog counts as the settings page only when its accessible
            // name or top-level heading IS a settings title (optionally with a
            // " · xxx" suffix). Body copy that merely mentions "settings"
            // (e.g. "Notification settings") must not match.
            const SETTINGS_TITLE_RE = /^(?:设置|settings)(?:\s*[·:：]\s*\S.*)?$/i;
            // Loose hint used to FIND the trigger …
            const SETTINGS_HINT_RE = /设置|settings/i;
            // … but never click things clearly about auth / account / plugins.
            const SETTINGS_BLOCK_RE = /登录|登出|退出|账户|账号|插件|主题|通知|个人|sign\s?in|sign\s?out|log\s?(?:in|out)|account|plugin|theme|notif/i;
            // v1.0.3: only a VISIBLE settings node counts. A settings panel the
            // host keeps mounted but hidden used to match here, so openSettings
            // returned at once and the click looked dead, with no popup at all.
            const isVisibleEl = (el: Element) => {
              try {
                const r = el.getBoundingClientRect();
                const s = getComputedStyle(el);
                return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden';
              } catch { return false; }
            };
            const isSettingsOpenInDom = () => {
              try {
                // the panel is the positive signal; check it first
                const panel = document.querySelector<HTMLElement>('.AnXs9G_panel');
                if (panel && isVisibleEl(panel)) return true;
                for (const el of document.querySelectorAll<HTMLElement>(SETTINGS_OPEN_SEL)) {
                  if (isVisibleEl(el)) return true;
                }
                const pathHash = `${location.pathname}${location.hash}`;
                if (/(^|[/#])settings([/?#]|$)/i.test(pathHash)) return true;
                const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"][data-state="open"], [role="dialog"][aria-modal="true"]');
                for (const d of dialogs) {
                  const label = (d.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
                  if (SETTINGS_TITLE_RE.test(label)) return true;
                  for (const head of d.querySelectorAll<HTMLElement>('h1, h2, h3')) {
                    const txt = (head.textContent || '').replace(/\s+/g, ' ').trim();
                    if (SETTINGS_TITLE_RE.test(txt)) return true;
                  }
                }
              } catch { /* fall through */ }
              return false;
            };
            const waitFor = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
            // Quick confirmation window (~360ms); every next destructive action
            // is preceded by a 500ms late-arrival re-check, so a lazily mounted
            // panel (800ms+) can never be toggled closed by what follows.
            // v0.1.0: 25ms polls that return on the first hit, so a fast open is
            // answered at once. The official shortcut gets a longer window (~1s),
            // so its popup is caught there and the later levels never fire.
            const VERIFY_STEPS = Array(14).fill(25);
            const SHORTCUT_VERIFY_STEPS = Array(40).fill(25);
            const LATE_STEP = 200;
            const settleCheck = async () => { await waitFor(LATE_STEP); return isSettingsOpenInDom(); };
            // Cheap fingerprint of "something opened": body-level children,
            // open dialogs, radix popper layers and the current route.
            const chromeFingerprint = () => {
              try {
                return [
                  document.body ? document.body.children.length : 0,
                  document.querySelectorAll<HTMLElement>('[role="dialog"]').length,
                  document.querySelectorAll<HTMLElement>('[data-radix-popper-content-wrapper]').length,
                  `${location.pathname}${location.hash}`,
                ].join('|');
              } catch { return ''; }
            };
            // frame-paced: one check per paint, same total budget as the old 25ms steps.
            // Guarded with a timeout promise so background tabs (where rAF pauses) cannot
            // stall the whole chain — the timeout promise resolves even if rAF never fires.
            const nextFrame = (ms: number) => Promise.race<void>([
              new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
              new Promise<void>((resolve) => setTimeout(resolve, ms + 8))
            ]);
            const verifySettingsOpened = async (beforeFingerprint: string, steps: number[] = VERIFY_STEPS) => {
              const deadline = performance.now() + steps.reduce((sum, ms) => sum + ms, 0);
              while (performance.now() < deadline) {
                await nextFrame(steps[0]);
                if (isSettingsOpenInDom()) return true;
              }
              return isSettingsOpenInDom();
            };
            const isDeltaOwnElement = (el: Element) => {
              try {
                return !!(el.closest('[data-ens], .ens-foot-actions, .ens-search-dock, .ens-anno-panel, .ens-anno-btn, .ens-standalone-settings-modal, .ens-modal-card'));
              } catch { return false; }
            };
            // Snapshot of what the host actually exposes, taken when the user
            // clicks — the fallback modal renders this so a still-failing host
            // can be debugged from real data instead of another guess.
            const collectDiagSnapshot = () => {
              try { DIAG.url = `${location.pathname}${location.hash}`; } catch { /* ignore */ }
              try {
                const s = slots();
                DIAG.slotsApi = s ? Object.keys(s).slice(0, 24) : [];
              } catch { DIAG.slotsApi = []; }
              try {
                DIAG.dom = {
                  footArea: !!document.querySelector<HTMLElement>('.wtg9ga_footArea, [class*="_footArea"]'),
                  footerActions: !!document.querySelector<HTMLElement>('.wtg9ga_footerActions, [class*="_footerActions"]'),
                  accountTrigger: !!document.querySelector<HTMLElement>('._5Qcc8a_trigger, [data-signed-out]'),
                  nativeSettingsTrigger: !!document.querySelector<HTMLElement>('.AnXs9G_trigger, [class*="_settingsTrigger"]'),
                };
              } catch { /* ignore */ }
            };
            const nativeSettingsTriggerCandidates = () => {
              const seen = new Set<Element>();
              const found: Element[] = [];
              const push = (el: Element | null) => {
                if (!el || seen.has(el) || isDeltaOwnElement(el)) return;
                if (el.hasAttribute('hidden')) return;
                if ((el as HTMLButtonElement).disabled) return;
                if (el.getAttribute('aria-hidden') === 'true') return;
                if (el.closest('[role="menu"], [role="menuitem"]')) return; // the menu path handles those
                seen.add(el);
                found.push(el);
              };
              const asClickable = (el: Element | null): Element | null => {
                if (!el) return null;
                if (el.matches('button, [role="button"]')) return el;
                return el.querySelector<HTMLElement>('button, [role="button"]');
              };
              // (a) known / hashed trigger classes (current shipped build)
              document.querySelectorAll<HTMLElement>('.AnXs9G_trigger, [class*="_settingsTrigger"], [class*="_settingsBtn"], [class*="_settingsButton"]')
                .forEach((el) => push(asClickable(el) || el));
              // (b) accessible-name match: aria-label / title only needs to
              //     MENTION 设置 / settings ("Open settings", "打开设置"…),
              //     unless it is clearly about auth / account / plugins.
              document.querySelectorAll<HTMLElement>('button, [role="button"]').forEach((el) => {
                if (seen.has(el)) return;
                const name = (el.getAttribute('aria-label') || el.getAttribute('title') || '').replace(/\s+/g, ' ').trim();
                if (name && SETTINGS_HINT_RE.test(name) && !SETTINGS_BLOCK_RE.test(name)) push(el);
              });
              // (c) short visible-text scan across clickable chrome
              document.querySelectorAll<HTMLElement>('button, [role="button"], [role="tab"], a').forEach((el) => {
                if (seen.has(el)) return;
                const accessible = (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || '').replace(/\s+/g, ' ').trim();
                if (accessible && accessible.length <= 24 && SETTINGS_HINT_RE.test(accessible) && !SETTINGS_BLOCK_RE.test(accessible)) push(el);
              });
              // (d) structural anchor: the footer actions row holds our own
              //     buttons, the account launcher and (when the shell keeps
              //     it) the settings trigger. Excluding the first two leaves
              //     the settings trigger — this survives a total class-hash
              //     drift and icon-only buttons.
              try {
                document.querySelectorAll<HTMLElement>('.wtg9ga_footerActions, [class*="_footerActions"]').forEach((host) => {
                  for (const el of host.querySelectorAll<HTMLElement>('button, [role="button"]')) {
                    if (seen.has(el) || isDeltaOwnElement(el)) continue;
                    if (el.hasAttribute('hidden')) continue;
                    if ((el as HTMLButtonElement).disabled) continue;
                    if (el.getAttribute('aria-hidden') === 'true') continue;
                    if (el.closest('[role="menu"], [role="menuitem"]')) continue;
                    if (el.matches('._5Qcc8a_trigger, [data-signed-out], [data-account], [class*="_accountTrigger"], [aria-haspopup="menu"]')) continue;
                    const name = (el.getAttribute('aria-label') || el.getAttribute('title') || '').replace(/\s+/g, ' ').trim();
                    if (name && SETTINGS_BLOCK_RE.test(name)) continue;
                    const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
                    if (SETTINGS_BLOCK_RE.test(txt)) continue;
                    push(el);
                  }
                });
              } catch { /* ignore */ }
              return found.slice(0, 4);
            };
            // Level 1 — host shell store / slot operations. Singleton shapes
            // first (getState().actions.open(), store.open(), injected
            // operations), then create() LAST and verified: the v1.0.0 bug was
            // the unverified early return, not the call itself — some shells
            // genuinely expose a working create().
            const attemptStoreOpen = async () => {
              if (isSettingsOpenInDom()) return true;
              const entries = [...slotEntries('sidebar.settings'), ...slotEntries('settings.launcher')];
              const shapes = [...new Set(entries.map((e) => Object.keys(e || {}).join('+')))];
              note('store', `entries=${entries.length}${shapes.length ? ` shapes=[${shapes.join(' ; ')}]` : ''}`);
              for (const e of entries) {
                const actions: Array<[string, () => void]> = [];
                const store = e?.options?.store || e?.store;
                try {
                  const state = store?.getState?.();
                  const stateOpen = state?.actions?.open;
                  if (typeof stateOpen === 'function') actions.push(['state.actions.open()', () => stateOpen()]);
                } catch { /* ignore */ }
                const storeOpen = store?.open;
                if (typeof storeOpen === 'function') actions.push(['store.open()', () => storeOpen()]);
                try {
                  const inj = (typeof e?.inject === 'function' ? e.inject() : null)
                    || (typeof e?.options?.inject === 'function' ? e.options.inject() : null);
                  const injObj = (inj ?? {}) as { openSettings?: () => unknown; open?: () => unknown };
                  if (typeof injObj.openSettings === 'function') actions.push(['inject().openSettings()', () => injObj.openSettings?.()]);
                  if (typeof injObj.open === 'function') actions.push(['inject().open()', () => injObj.open?.()]);
                } catch { /* ignore */ }
                if (typeof store?.create === 'function') {
                  try {
                    const inst = store.create();
                    const instOpen = inst?.actions?.open;
                    if (typeof instOpen === 'function') actions.push(['store.create().actions.open()', () => instOpen()]);
                  } catch { /* ignore */ }
                }
                for (const [label, act] of actions) {
                  const before = chromeFingerprint();
                  try { act(); note('store', `called ${label}`); }
                  catch (err) { note('store', `${label} threw: ${err instanceof Error ? err.message : String(err)}`); }
                  if (await verifySettingsOpened(before)) return true;
                }
              }
              return isSettingsOpenInDom();
            };
            // Level 2 — sibling host packages (v1.0.2). The manifest injects
            // this plugin into three @deepseek-ai/dsh-client-ui-* packages, so
            // the loader resolves them by id; the one that owns the settings
            // shell is probed the same way, and any export (or member one
            // level deep) whose name says “open the settings” is called and
            // verified. Read-only probing; every require is guarded.
            const OPENISH_RE = /^(?:open|show|launch)(?:Settings|SettingsPage|Preferences)?$/i;
            const HOST_MODULE_IDS = [
              '@deepseek-ai/dsh-client-ui-settings',
              '@deepseek-ai/dsh-client-settings',
              '@deepseek-ai/dsh-client-ui-preferences',
              '@deepseek-ai/dsh-client-ui-settings-shell',
              '@deepseek-ai/dsh-client-ui-sidebar',
              '@deepseek-ai/dsh-client-ui-layout',
            ];
            const attemptHostModules = async () => {
              if (isSettingsOpenInDom()) return true;
              const ids = [...HOST_MODULE_IDS];
              // registry discovery, when the loader exposes one
              try {
                const ml = window.__ModuleLoader__;
                const regs = [ml?.modules, ml?.registry, ml?.cache, ml?.definitions].filter(Boolean);
                for (const reg of regs) {
                  let keys = [];
                  if (typeof reg?.keys === 'function') keys = reg.keys();
                  else if (reg instanceof Map) keys = [...reg.keys()];
                  for (const k of keys) {
                    if (typeof k === 'string' && /settings|preferences/i.test(k) && !ids.includes(k)) ids.push(k);
                  }
                }
              } catch { /* ignore */ }
              for (const id of ids) {
                let mod = null;
                try { mod = require(id); } catch { continue; }
                if (!mod) continue;
                try { DIAG.moduleProbe.push(`${id} → [${Object.keys(mod).slice(0, 10).join(',') || '(no exports)'}]`); } catch { /* ignore */ }
                const actions: Array<[string, () => void]> = [];
                const seen = new Set<object>();
                const collect = (obj: unknown, path: string, depth: number) => {
                  if (!obj || seen.has(obj) || (typeof obj !== 'object' && typeof obj !== 'function')) return;
                  seen.add(obj as object);
                  let keys: string[] = [];
                  try { keys = Object.keys(obj as object).slice(0, 40); } catch { return; }
                  for (const key of keys) {
                    let v: unknown;
                    try { v = (obj as Record<string, unknown>)[key]; } catch { continue; }
                    if (typeof v === 'function' && OPENISH_RE.test(key)) {
                      actions.push([`${path}${key}()`, () => v()]);
                    } else if (v && typeof v === 'object' && depth < 1) {
                      collect(v, `${path}${key}.`, depth + 1);
                    }
                  }
                };
                try { collect(mod, `${id}:`, 0); } catch { /* ignore */ }
                for (const [label, act] of actions) {
                  const before = chromeFingerprint();
                  try { act(); note('host-module', `called ${label}`); }
                  catch (err) { note('host-module', `${label} threw: ${err instanceof Error ? err.message : String(err)}`); }
                  if (await verifySettingsOpened(before)) return true;
                }
              }
              return isSettingsOpenInDom();
            };
            // Level 3 — the host's own settings trigger, resolved through the
            // candidate list above, each click verified before the next; a
            // 500ms late-arrival re-check runs between candidates so a slow
            // panel is never toggled closed by the next click.
            const attemptNativeTrigger = async () => {
              if (isSettingsOpenInDom()) return true;
              const candidates = nativeSettingsTriggerCandidates();
              note('native-trigger', `candidates=${candidates.length}`);
              for (const el of candidates) {
                if (isSettingsOpenInDom()) return true;
                const before = chromeFingerprint();
                try {
                  (el as HTMLElement).click();
                  note('native-trigger', `clicked <${(el.tagName || '').toLowerCase()} class="${(el.getAttribute('class') || '').slice(0, 48)}">`);
                } catch (err) { note('native-trigger', `click threw: ${err instanceof Error ? err.message : String(err)}`); }
                if (await verifySettingsOpened(before)) return true;
                if (await settleCheck()) return true;
              }
              return isSettingsOpenInDom();
            };
            // Level 4 — host accelerator (设置 Ctrl+Alt+, on web, Ctrl+, /
            // Cmd+, on desktop). v1.0.2 dispatches each event exactly once, at
            // the deepest app container it can find (#root / #app / first body
            // child): the event bubbles body → document → window, so every
            // listener on the path fires once — the v1.0.1 triple dispatch on
            // window/document/body made a toggle-style handler fire three
            // times per press (open-close-open).
            const attemptShortcuts = async () => {
              if (isSettingsOpenInDom()) return true;
              let isMac = false;
              try { isMac = /mac/i.test(navigator.platform || navigator.userAgent || ''); } catch { /* ignore */ }
              // v1.0.3: the host's official binding is Ctrl+, (Cmd+, on macOS),
              // as the shipped verify-native-settings check presses it. The old
              // Ctrl+Alt+, combo is not a settings binding and is dropped.
              const combos = isMac
                ? [{ metaKey: true, altKey: false, ctrlKey: false }]
                : [{ metaKey: false, altKey: false, ctrlKey: true }];
              let target = null;
              try {
                target = document.querySelector<HTMLElement>('#root, #app, [data-reactroot]')
                  || document.body.firstElementChild || document.body;
              } catch { target = document.body; }
              if (!target || !target.dispatchEvent) target = document.body;
              const tag = target === document.body ? 'body' : (target.id || target.getAttribute('class') || target.tagName || 'el').toString().slice(0, 30);
              note('shortcuts', `combos=${combos.length} target=${tag}`);
              for (const combo of combos) {
                const before = chromeFingerprint();
                for (const type of ['keydown', 'keyup']) {
                  try {
                    target.dispatchEvent(new KeyboardEvent(type, {
                      key: ',', code: 'Comma', keyCode: 188, which: 188,
                      bubbles: true, cancelable: true, composed: true,
                      ...combo,
                    }));
                  } catch { /* ignore */ }
                }
                if (await verifySettingsOpened(before, SHORTCUT_VERIFY_STEPS)) return true;
                if (await settleCheck()) return true;
              }
              return isSettingsOpenInDom();
            };
            // Level 5 — account menu's 设置 item. The chrome loop hides that
            // row (hideAccountMenuSettings), so briefly re-expose it for the
            // programmatic click, then restore it. v1.0.2 adds the Radix
            // collection attribute to the item selector and records the menu's
            // actual contents for the diagnostic. If the menu holds no settings
            // entry at all, dismiss it again so nothing stays open.
            const attemptAccountMenu = async () => {
              if (isSettingsOpenInDom()) return true;
              const account = document.querySelector<HTMLElement>('._5Qcc8a_trigger')
                || document.querySelector<HTMLElement>('[class*="_footerActions"] [data-signed-out]')
                || document.querySelector<HTMLElement>('[data-signed-out]');
              if (!account) { note('account-menu', 'account trigger not found'); return false; }
              const before = chromeFingerprint();
              try { (account as HTMLElement).click(); } catch (err) { note('account-menu', `trigger click threw: ${err instanceof Error ? err.message : String(err)}`); return false; }
              const ITEM_SEL = '[role="menuitem"], [role="menu"] button, [role="menu"] a, [role="menu"] [tabindex], [data-radix-collection-item]';
              let isRecorded = false;
              const recordMenu = () => {
                if (isRecorded) return;
                const texts = [...document.querySelectorAll<HTMLElement>(ITEM_SEL)]
                  .map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 10);
                if (texts.length) { note('account-menu', `menu items=[${texts.join(' | ')}]`); isRecorded = true; }
              };
              const pickSettingsItem = () => {
                for (const el of document.querySelectorAll<HTMLElement>(ITEM_SEL)) {
                  const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
                  if (/^设置(?:\s|$|\+|C)/.test(txt) || /^settings(?:\s|$|\+|C)/i.test(txt)) {
                    const prev = (el as HTMLElement).style.display;
                    (el as HTMLElement).style.display = '';
                    (el as HTMLElement).click();
                    (el as HTMLElement).style.display = prev;
                    note('account-menu', `clicked menu item "${txt.slice(0, 24)}"`);
                    return true;
                  }
                }
                return false;
              };
              let isClickedMenuItem = false;
              for (const waitMs of [60, 120, 240, 400]) {
                await waitFor(waitMs);
                if (isSettingsOpenInDom()) return true;
                recordMenu();
                if (!isClickedMenuItem) isClickedMenuItem = pickSettingsItem();
              }
              const isOpened = isSettingsOpenInDom();
              if (!isOpened && !isClickedMenuItem && chromeFingerprint() !== before) {
                try {
                  document.dispatchEvent(new KeyboardEvent('keydown', {
                    key: 'Escape', code: 'Escape', keyCode: 27, which: 27,
                    bubbles: true, cancelable: true, composed: true,
                  }));
                  note('account-menu', 'no settings item — dismissed the menu');
                } catch { /* ignore */ }
              } else if (!isOpened) {
                note('account-menu', isClickedMenuItem ? 'clicked the item but the page did not open' : 'menu had no settings item');
              }
              return isOpened;
            };

            // Level 6 — the guaranteed fallback (restored from the 0.1.x
            // lineage): whatever the host does, the click always answers. When
            // the host page could not be opened the modal also carries the
            // diagnostic report and a copy button, so the next round can adapt
            // to the real host instead of guessing.
            const renderDomSettingsInto = (container: HTMLElement) => {
              container.textContent = '';
              const wrap = document.createElement('div');
              wrap.className = 'ens-settings';
              const head = document.createElement('div');
              head.className = 'ens-set-head';
              const title = document.createElement('div');
              title.className = 'ens-set-title';
              title.textContent = 'Delta UI';
              const sub = document.createElement('div');
              sub.className = 'ens-set-sub';
              sub.textContent = pick(
                '外观与功能模块。仅「可用」的开关可操作，其余标注其真实状态。',
                'Appearance and feature modules. Only available switches are operable; the rest state their real status.',
              );
              head.append(title, sub);
              const list = document.createElement('div');
              list.className = 'ens-set-list';
              MODULES.forEach((m) => {
                const ready = m.status === 'ready';
                const row = document.createElement('div');
                row.className = 'ens-set-row' + (ready ? '' : ' ens-set-row-planned');
                const text = document.createElement('div');
                text.className = 'ens-set-text';
                const name = document.createElement('div');
                name.className = 'ens-set-name';
                name.textContent = pick(m.zh, m.en);
                const en = document.createElement('div');
                en.className = 'ens-set-en';
                en.textContent = pick(m.en, m.zh);
                const desc = document.createElement('div');
                desc.className = 'ens-set-desc';
                desc.textContent = pick(m.zhDesc, m.enDesc);
                text.append(name, en, desc);
                const side = document.createElement('div');
                side.className = 'ens-set-side';
                if (STATUS_TAG[m.status]) {
                  const tag = document.createElement('span');
                  tag.className = 'ens-plan-tag';
                  tag.textContent = pick(STATUS_TAG[m.status], STATUS_TAG_EN[m.status]);
                  side.appendChild(tag);
                }
                if (ready) {
                  const sw = document.createElement('button');
                  sw.type = 'button';
                  sw.setAttribute('role', 'switch');
                  sw.setAttribute('aria-label', m.zh);
                  sw.setAttribute('aria-checked', moduleOn(m.id) ? 'true' : 'false');
                  sw.className = 'ens-switch' + (moduleOn(m.id) ? ' ens-switch-on' : '');
                  sw.innerHTML = '<span class="ens-switch-knob"></span>';
                  sw.addEventListener('click', () => {
                    writeFlag(m.id, !moduleOn(m.id));
                    renderDomSettingsInto(container);
                  });
                  side.appendChild(sw);
                }
                row.append(text, side);
                list.appendChild(row);
              });
              // v0.1.0: names hidden from the model picker, same as the React section
              const hiddenRow = document.createElement('div');
              hiddenRow.className = 'ens-set-row';
              const hiddenText = document.createElement('div');
              hiddenText.className = 'ens-set-text';
              const hiddenName = document.createElement('div');
              hiddenName.className = 'ens-set-name';
              hiddenName.textContent = pick('在模型列表中隐藏', 'Hide in model list');
              const hiddenDesc = document.createElement('div');
              hiddenDesc.className = 'ens-set-desc';
              hiddenDesc.textContent = pick(
                '输入模型名称，用逗号分隔。只影响列表显示，模型仍可被调用。',
                'Enter model names, comma-separated. Only the list changes; the models stay callable.',
              );
              hiddenText.append(hiddenName, hiddenDesc);
              const hiddenInput = document.createElement('input');
              hiddenInput.className = 'jrmgQW_input';
              hiddenInput.placeholder = 'Omni';
              hiddenInput.value = readHidden();
              hiddenInput.addEventListener('input', () => writeHidden(hiddenInput.value));
              hiddenRow.append(hiddenText, hiddenInput);
              list.appendChild(hiddenRow);
              const privacy = document.createElement('div');
              privacy.className = 'ens-privacy';
              const privacyTitle = document.createElement('div');
              privacyTitle.className = 'ens-privacy-title';
              privacyTitle.textContent = pick('隐私', 'Privacy');
              const privacyBody = document.createElement('div');
              privacyBody.className = 'ens-privacy-body';
              privacyBody.textContent = pick(
                '本插件不主动上传会话日志；仍需在宿主中关闭官方日志上传。视觉识别与搜索请求会发送给用户配置的服务。',
                'This plugin excludes session-log uploads when the host service is available; disable the host feature too. Vision and search send requests to configured services.',
              );
              privacy.append(privacyTitle, privacyBody);
              wrap.append(head, list, privacy);
              container.appendChild(wrap);
            };
            const diagText = () => [
              'Delta UI — 设置打开诊断',
              `页面: ${DIAG.url || '(unknown)'}`,
              `UA: ${DIAG.ua || '(unknown)'}`,
              `slots API keys: ${DIAG.slotsApi.join(', ') || '(none)'}`,
              `DOM: footArea=${DIAG.dom.footArea ? 'y' : 'n'} footerActions=${DIAG.dom.footerActions ? 'y' : 'n'} accountTrigger=${DIAG.dom.accountTrigger ? 'y' : 'n'} nativeSettingsTrigger=${DIAG.dom.nativeSettingsTrigger ? 'y' : 'n'}`,
              ...(DIAG.moduleProbe.length ? [`host modules: ${DIAG.moduleProbe.join(' ; ')}`] : []),
              ...DIAG.attempts,
            ].join('\n');
            let diagBoxEl: HTMLPreElement | null = null;
            const openStandaloneSettings = (isWithReport: boolean) => {
              const existing = document.querySelector<HTMLElement>('.ens-standalone-settings-modal');
              if (existing) {
                if (isWithReport && diagBoxEl) diagBoxEl.textContent = diagText();
                return;
              }
              const backdrop = document.createElement('div');
              backdrop.className = 'ens-modal-backdrop ens-standalone-settings-modal';
              backdrop.setAttribute('role', 'dialog');
              backdrop.setAttribute('aria-modal', 'true');
              backdrop.setAttribute('aria-label', pick('设置 · Delta UI', 'Settings · Delta UI'));
              const card = document.createElement('div');
              card.className = 'ens-modal-card';
              const top = document.createElement('div');
              top.className = 'ens-modal-top';
              const headBox = document.createElement('div');
              const titleEl = document.createElement('div');
              titleEl.className = 'ens-modal-title';
              titleEl.textContent = pick('设置 · Delta UI', 'Settings · Delta UI');
              const subEl = document.createElement('div');
              subEl.className = 'ens-modal-sub';
              subEl.textContent = 'Delta UI';
              headBox.append(titleEl, subEl);
              const btns = document.createElement('div');
              btns.style.cssText = 'display:flex;gap:8px;flex:none;';
              const mkBtn = (label: string, isPrimary: boolean) => {
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'ens-pill-btn' + (isPrimary ? ' ens-pill-btn-primary' : '');
                b.textContent = label;
                return b;
              };
              const close = () => {
                try { backdrop.remove(); } catch { /* ignore */ }
                try { document.removeEventListener('keydown', onKey, true); } catch { /* ignore */ }
              };
              const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') { try { ev.stopPropagation(); } catch { /* ignore */ } close(); } };
              if (isWithReport) {
                const retry = mkBtn(pick('重试打开宿主设置页', 'Retry host settings'), true);
                retry.addEventListener('click', () => { close(); openSettingsChain(); });
                btns.appendChild(retry);
              }
              const copyBtn = isWithReport ? mkBtn(pick('复制诊断信息', 'Copy diagnostics'), false) : null;
              const closeBtn = mkBtn(pick('关闭 (Esc)', 'Close (Esc)'), false);
              if (copyBtn) btns.appendChild(copyBtn);
              btns.appendChild(closeBtn);
              closeBtn.addEventListener('click', close);
              if (copyBtn) {
                copyBtn.addEventListener('click', async () => {
                  const text = diagText();
                  let isOk = false;
                  try { await navigator.clipboard.writeText(text); isOk = true; } catch { /* fall through */ }
                  if (!isOk) {
                    try {
                      const ta = document.createElement('textarea');
                      ta.value = text;
                      ta.style.cssText = 'position:fixed;opacity:0;';
                      document.body.appendChild(ta);
                      ta.select();
                      isOk = document.execCommand('copy');
                      ta.remove();
                    } catch { /* ignore */ }
                  }
                  copyBtn.textContent = isOk ? pick('已复制', 'Copied') : pick('复制失败，见控制台', 'Copy failed — see console');
                  setTimeout(() => { copyBtn.textContent = pick('复制诊断信息', 'Copy diagnostics'); }, 1600);
                  try { console.info('[dsh-ui-delta] 诊断信息：\n' + diagText()); } catch { /* ignore */ }
                });
              }
              top.append(headBox, btns);
              card.appendChild(top);
              if (isWithReport) {
                const banner = document.createElement('div');
                banner.className = 'ens-modal-banner';
                banner.textContent = pick(
                  '未能打开宿主的设置页，已改用 Delta UI 内置面板。若需要打开宿主设置页，请点「复制诊断信息」并把内容发回维护者，下一版将按真实接口适配。',
                  'The host settings page could not be opened, so this built-in panel answered instead. Copy the diagnostics and send them back to the maintainer so the next build can target the real host API.',
                );
                card.appendChild(banner);
                diagBoxEl = document.createElement('pre');
                diagBoxEl.className = 'ens-diag-box';
                diagBoxEl.textContent = diagText();
                card.appendChild(diagBoxEl);
              } else {
                diagBoxEl = null;
              }
              const mountNode = document.createElement('div');
              card.appendChild(mountNode);
              renderDomSettingsInto(mountNode);
              backdrop.appendChild(card);
              backdrop.addEventListener('click', (ev) => { if (ev.target === backdrop) close(); });
              document.addEventListener('keydown', onKey, true);
              document.body.appendChild(backdrop);
              try { closeBtn.focus(); } catch { /* ignore */ }
            };

            // The foot 设置 always opens the host's settings page, signed in or not.
            // Delta UI's own settings live in that page's "Delta UI" section.
            const openSettings = () => openSettingsChain();
            let isOpenSettingsBusy = false;
            let openSettingsBusySince = 0;
            const openSettingsChain = async () => {
              try { console.info('[dsh-ui-delta] settings requested'); } catch { /* ignore */ }
              if (isSettingsOpenInDom()) {       // already open — never toggle-close it
                try { console.info('[dsh-ui-delta] 设置已可见，不再重复打开'); } catch { /* ignore */ }
                return;
              }
              // a stuck chain must not swallow every later click: expire after 8s
              if (isOpenSettingsBusy && Date.now() - openSettingsBusySince < 8000) return;
              isOpenSettingsBusy = true;
              openSettingsBusySince = Date.now();
              const t0 = Date.now(); // v0.1.0: elapsed time is logged on success
              DIAG.attempts.length = 0;
              collectDiagSnapshot();
              const btn = document.querySelector<HTMLElement>('.ens-foot-actions [data-ens="settings"]');
              if (btn) { btn.classList.add('ens-foot-action-busy'); btn.setAttribute('aria-busy', 'true'); }
              try {
                // settleBefore marks the destructive levels: a slow panel from
                // the previous level gets one late-arrival re-check before any
                // further click or key dispatch can toggle it closed again.
                // v1.0.3: the official Ctrl+, shortcut leads (it opens the
                // centred settings popup), then the guessed levels follow.
                const LEVELS = [
                  { label: 'shortcuts', attempt: attemptShortcuts, settleBefore: false },
                  { label: 'store', attempt: attemptStoreOpen, settleBefore: true },
                  { label: 'host-module', attempt: attemptHostModules, settleBefore: false },
                  { label: 'native-trigger', attempt: attemptNativeTrigger, settleBefore: true },
                  { label: 'account-menu', attempt: attemptAccountMenu, settleBefore: false },
                ];
                for (const { label, attempt, settleBefore } of LEVELS) {
                  if (settleBefore && await settleCheck()) {
                    try { console.info(`[dsh-ui-delta] settings already opened before ${label}`); } catch { /* ignore */ }
                    return;
                  }
                  let isOpened = false;
                  try { isOpened = await attempt(); }
                  catch (err) { note(label, `level threw: ${err instanceof Error ? err.message : String(err)}`); }
                  if (isOpened) {
                    try { console.info(`[dsh-ui-delta] settings opened via ${label} in ${Date.now() - t0}ms`); } catch { /* ignore */ }
                    return;
                  }
                }
                try { console.info('[dsh-ui-delta] host settings unavailable; diagnostics:', DIAG); } catch { /* ignore */ }
              } finally {
                isOpenSettingsBusy = false;
                if (btn) { btn.classList.remove('ens-foot-action-busy'); btn.removeAttribute('aria-busy'); }
              }
            };
            const startSignIn = () => {
              const ops = launcherOps();
              try { if (ops?.start) { ops.start(); return; } } catch { /* fall through */ }
              // DOM fallback: open the account menu, then click its 登录 item.
              const trig = document.querySelector<HTMLElement>('._5Qcc8a_trigger');
              if (!trig) return;
              trig.click();
              setTimeout(() => {
                const item = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')]
                  .find(el => /登录|登 入|sign\s?in/i.test(el.textContent || ''));
                item?.click();
              }, 80);
            };
            // v0.1.0: 登出 goes through the host's own account menu, so the host
            // still shows its sign-out confirmation before anything is cleared.
            const signOutFromMenu = () => {
              const trig = document.querySelector<HTMLElement>('._5Qcc8a_trigger');
              if (!trig) return;
              trig.click();
              setTimeout(() => {
                const item = [...document.querySelectorAll<HTMLElement>('[role="menuitem"], [role="menu"] button, [role="menu"] [tabindex]')]
                  .find(el => /退出|登出|sign\s?out/i.test(el.textContent || ''));
                item?.click();
              }, 80);
            };
            const signedIn = () => {
              try { return launcherOps()?.hooks?.account?.getSnapshot?.()?.view?.status === 'credential-stored'; }
              catch { return false; }
            };

            // #30 the signed-out seat shows the DeepSeek Harness whale mark.
            // Clone the host brand SVG (hidden by #1 but still in the DOM) so
            // the avatar slot carries the product identity without shipping a
            // second copy of the artwork; fall back to a person glyph.
            function injectAccountGlyph(trigger: HTMLElement | null) {
              if (!trigger || trigger.querySelector<HTMLElement>('.ens-account-glyph')) return;
              const g = document.createElement('span');
              g.className = 'ens-account-glyph';
              g.setAttribute('aria-hidden', 'true');
              const mark = document.querySelector<HTMLElement>('.wtg9ga_brandMark svg');
              g.innerHTML = mark ? mark.outerHTML : ICON_PERSON;
              trigger.appendChild(g);
            }

            // #30 设置 lives at the sidebar foot, right-aligned on the account
            // row, and opens the settings surface directly.
            function mountFootSettings() {
              // the host's own footer row holds the account launcher; append
              // beside it so the avatar and the actions share one line. Early
              // runs may precede footerActions, so collapse any extra boxes and
              // keep exactly one, always in the preferred host.
              const host = document.querySelector<HTMLElement>('.wtg9ga_footerActions');
              if (!host) return;

              // Ensure a single global .ens-foot-actions. If host changed, move it.
              let box = document.querySelector<HTMLElement>('.ens-foot-actions');
              if (box && box.parentElement !== host) {
                box.remove();
                box = null;
              }
              if (!box) {
                box = document.createElement('div');
                box.className = 'ens-foot-actions';
                host.appendChild(box);
              } else if (!host.contains(box)) {
                host.appendChild(box);
              }
              // Remove any stale duplicates (should be none, but safe).
              document.querySelectorAll<HTMLElement>('.ens-foot-actions').forEach((el) => {
                if (el !== box) el.remove();
              });

              // Notifications sit above the footer and do not consume icon-row space.
              if (!box.querySelector<HTMLElement>('[data-ens="notify"]')) {
                const notify = document.createElement('div');
                notify.dataset.ens = 'notify';
                notify.className = 'ens-foot-notify';
                notify.innerHTML = `<span></span><button class="ens-foot-notify-close" aria-label="${t('关闭', 'Close')}">×</button>`;
                box.insertBefore(notify, box.firstChild);
                const notifyClose = notify.querySelector<HTMLElement>('.ens-foot-notify-close');
                notifyClose?.addEventListener('click', (e) => {
                  e.stopPropagation();
                  notify.classList.remove('visible', 'error', 'warn', 'info');
                  const notifyText = notify.querySelector<HTMLElement>('span');
                  if (notifyText) notifyText.textContent = '';
                });
              }
              // v0.1.0: both foot actions are icon buttons. 设置 sits left and
              // 登录/登出 right, the account being the trailing item as usual;
              // the CSS order pins that whatever the insertion order.
              const iconBtn = (key: string, icon: string, label: string, fn: (b: HTMLButtonElement) => void) => {
                if (box.querySelector<HTMLElement>('[data-ens="' + key + '"]')) return;
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'ens-foot-action ens-foot-icon';
                b.dataset.ens = key;
                b.innerHTML = icon;
                b.setAttribute('aria-label', label);
                b.title = label;
                b.addEventListener('click', () => fn(b));
                box.appendChild(b);
              };
              // 分享 was removed per feedback: only 设置 and the account sit here.
              iconBtn('settings', ICON_SETTINGS, t('设置', 'Settings'), () => openSettings());
              const settingsBtn = box.querySelector<HTMLElement>('[data-ens="settings"]');
              if (settingsBtn) settingsBtn.title = t('设置', 'Settings');
              iconBtn('account', ICON_LOGIN, t('登录', 'Sign in'), () => (signedIn() ? signOutFromMenu() : startSignIn()));
            }

            // The update indicator already belongs to the settings trigger row.
            // Keep it there so the host tooltip follows its actual anchor.
            const versionActions = new Set<HTMLElement>();
            function mountVersionAction() {
              versionActions.forEach((action) => { if (!action.isConnected) versionActions.delete(action); });
              document.querySelectorAll<HTMLElement>('.wtg9ga_settingsArea button, .wtg9ga_settingsArea a, .wtg9ga_settingsArea [role="button"]').forEach((action) => {
                const text = (action.textContent || '').replace(/[↓⬇⇩]/g, '').replace(/\s+/g, ' ').trim();
                const label = `${action.getAttribute('aria-label') || ''} ${action.title || ''} ${text}`.trim();
                if (!/new version|update available/i.test(label)
                  && !label.includes('新版本') && !label.includes('新版提示')) return;
                action.classList.add('ens-version-action');
                versionActions.add(action);
              });
            }
            function restoreVersionActions() {
              versionActions.forEach((action) => action.classList.remove('ens-version-action'));
              versionActions.clear();
            }

            // #30 the account menu must never carry 设置: the foot button is the
            // only door. The item's text is "设置 Ctrl + ," (shortcut inside the
            // same node) and it may not carry role="menuitem", so match on the
            // leading word and cover the common menu item shapes.
            // Also hide 意见反馈 / 已经反馈 (feedback) — only the foot button remains.
            function hideAccountMenuSettings() {
              const nodes = document.querySelectorAll<HTMLElement>(
                '[role="menuitem"], [role="menu"] button, [role="menu"] a, [role="menu"] [tabindex]',
              );
              nodes.forEach(el => {
                const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
                if (/^设置(?:\s|$|\+|C)/.test(txt) || /^settings(?:\s|$|\+|C)/i.test(txt) || /反馈/.test(txt)) {
                  el.style.display = 'none';
                }
              });
            }

            // #30 the signed-out seat shows the whale mark instead of the
            // avatar; the host's own trigger carries data-signed-out, so the
            // CSS swaps the glyph. Nothing to sync from JS any more.
            // v0.1.0: the foot 登录/登出 label follows the account state; run()
            // calls this on every render, so it stays in step with sign-in.
            function syncLoginVisibility() {
              syncBalance();
              const acct = document.querySelector<HTMLElement>('.ens-foot-actions [data-ens="account"]');
              if (!acct) return;
              const isOn = signedIn();
              const label = isOn ? t('登出', 'Sign out') : t('登录', 'Sign in');
              if (acct.getAttribute('aria-label') === label) return;
              acct.innerHTML = isOn ? ICON_LOGOUT : ICON_LOGIN;
              acct.setAttribute('aria-label', label);
              acct.title = label;
            }
            // Match the host's decimal display without rounding a small balance to zero.
            const formatAccountBalance = (amount: string | number | undefined, currency: string | undefined) => {
              const match = String(amount ?? '').trim().match(/^([+-]?)(\d+)(?:\.(\d+))?$/);
              if (!match || !currency) return '';
              const integer = match[2].replace(/^0+(?=\d)/, '');
              const fraction = (match[3] || '').padEnd(2, '0');
              const cents = fraction.slice(0, 2);
              const symbol = currency === 'CNY' ? '¥' : currency === 'USD' ? '$' : `${currency} `;
              const isZero = /^0+$/.test(integer) && /^0*$/.test(fraction);
              if (isZero) return `${symbol}0.00`;
              const isNegative = match[1] === '-';
              if (/^0+$/.test(integer) && cents === '00') return `${isNegative ? '-' : '<'}${symbol}0.01`;
              return `${isNegative ? '-' : ''}${symbol}${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${cents}`;
            };
            // Only the Host's ready account snapshot can provide balances.
            function syncBalance() {
              const account = document.querySelector<HTMLElement>('._5Qcc8a_root');
              if (!account) return;
              if (!signedIn()) {
                account.removeAttribute('data-ens-balance');
                return;
              }
              const walletLines: string[] = [];
              try {
                const balance = launcherOps()?.hooks?.account?.getSnapshot?.()?.details?.balance;
                if (balance?.status === 'ready') {
                  const recharge = balance.value?.map(w => formatAccountBalance(w.balance, w.currency)).filter(Boolean) || [];
                  const bonus = balance.bonusWallets?.map(w => formatAccountBalance(w.balance, w.currency)).filter(Boolean) || [];
                  if (recharge.length) walletLines.push(`${t('账户余额', 'Account balance')}: ${recharge.join(' + ')}`);
                  if (bonus.length) walletLines.push(`${t('赠送余额', 'Bonus balance')}: ${bonus.join(' + ')}`);
                }
              } catch { /* Unavailable balance must never be shown as zero. */ }
              account.setAttribute('data-ens-balance', walletLines.join('\n') || t('余额暂不可用', 'Balance unavailable'));
            }

            // #2/#3 navigation copy. The owning packages own these slot cells,
            // so the labels are re-stamped on the rendered nodes instead of
            // re-registering the cells (which would shadow the shipped UI).
            const LABEL_MAP: Record<string, string> = {
              '新会话': '开始对话',
              '插件': '插件管理',
              '自动化任务': '定时任务',
            };
            function renameLabels() {
              const paint = (el: HTMLElement, text: string) => {
                if (el.textContent !== text) el.textContent = text;
              };
              document.querySelectorAll<HTMLElement>('.wtg9ga_newSessionLabel').forEach(el => {
                const next = LABEL_MAP[el.textContent || ''];
                if (next) paint(el, next);
              });
              document.querySelectorAll<HTMLElement>('.wtg9ga_panelTitle').forEach(el => {
                const next = LABEL_MAP[el.textContent || ''];
                if (next) paint(el, next);
              });
              document.querySelectorAll<HTMLElement>('.wtg9ga_newSession, .wtg9ga_panelRow').forEach(el => {
                const next = LABEL_MAP[el.getAttribute('aria-label') || ''];
                if (next) el.setAttribute('aria-label', next);
              });
              document.querySelectorAll<HTMLElement>('[class*="navCell"] [class*="navLabel"]').forEach(el => {
                const label = (el.textContent || '').trim();
                const next = label === t('模型', 'Models')
                  ? t('模型配置', 'Model configuration')
                  : LABEL_MAP[label];
                if (next) paint(el, next);
              });
              // the field already reads 搜索会话, so its hover tooltip is noise;
              // hide only that tooltip (matched by text) to keep others intact.
              // v0.2.2: also hide the new placeholder strings so the hint doesn't
              // double-render as a tooltip in either language.
              const searchHints = ['搜索会话', t('请输入搜索关键词', 'Type keywords to search')];
              document.querySelectorAll<HTMLElement>('[class*="tooltip"]').forEach(el => {
                if (searchHints.includes((el.textContent || '').trim())) el.style.display = 'none';
              });
            }

            const restoreNativeSearch = () => {
              const dock = document.querySelector<HTMLElement>('.ens-search-dock');
              if (!dock) return;
              const host = document.querySelector<HTMLElement>('.GAkraW_sectionHeader');
              const slot = dock.querySelector<HTMLElement>('.GAkraW_searchSlot');
              if (slot && !host) return;
              if (slot && host && !host.querySelector('.GAkraW_searchSlot')) host.appendChild(slot);
              dock.remove();
            };

            // #4 relocate the workspace search slot into a dock above 插件管理.
            // The host's `.GAkraW_searchSlot` is a React-owned node inside the
            // workspace header; we move the live one into the dock and drop the
            // stale duplicates React may orphan there after a re-render. The
            // dock clips everything to 44px, so the field can never paint over
            // the 工作区 row.
            function mountSearchDock() {
              const root = document.querySelector<HTMLElement>('.wtg9ga_root');
              if (!root) return;
              let dock = root.querySelector<HTMLElement>(':scope > .ens-search-dock');
              if (!dock) {
                dock = document.createElement('div');
                dock.className = 'ens-search-dock';
                root.insertBefore(dock, root.firstChild);
              }
              // the live slot is the one React currently manages in the header
              const live = document.querySelector<HTMLElement>('.GAkraW_sectionHeader .GAkraW_searchSlot');
              if (live && live.parentElement !== dock) dock.appendChild(live);
              // drop stale duplicates React may have orphaned in the dock
              const dups = [...dock.querySelectorAll<HTMLElement>('.GAkraW_searchSlot')];
              if (dups.length > 1) dups.slice(0, -1).forEach(el => el.remove());
              // v0.2.2: the hint text is ours to own. The dock carries it in
              // data-ens-placeholder (the CSS ::after reads it) and the real input
              // gets the same string, so the collapsed hint and the focused field
              // never disagree in either language. Re-stamped every run because
              // React re-renders the input and would restore its own placeholder.
              const hint = t('请输入搜索关键词', 'Type keywords to search');
              const search = dock.querySelector<HTMLElement>('.GAkraW_search');
              if (search && search.getAttribute('data-ens-placeholder') !== hint) {
                search.setAttribute('data-ens-placeholder', hint);
              }
              const input = dock.querySelector<HTMLElement>('.GAkraW_searchInput');
              if (input && input.getAttribute('placeholder') !== hint) input.setAttribute('placeholder', hint);
            }

            const hostVisibilityOrigins = new Map<HTMLElement, { display: string; hidden: HTMLElement['hidden']; ariaHidden: string | null }>();
            const setHostNodeVisible = (el: HTMLElement, isVisible: boolean) => {
              if (isVisible) {
                const original = hostVisibilityOrigins.get(el);
                if (original) {
                  el.style.display = original.display;
                  el.hidden = original.hidden;
                  if (original.ariaHidden === null) el.removeAttribute('aria-hidden');
                  else el.setAttribute('aria-hidden', original.ariaHidden);
                  hostVisibilityOrigins.delete(el);
                }
                return;
              }
              if (!hostVisibilityOrigins.has(el)) {
                hostVisibilityOrigins.set(el, {
                  display: el.style.display,
                  hidden: el.hidden,
                  ariaHidden: el.getAttribute('aria-hidden'),
                });
              }
              el.style.display = 'none';
              el.hidden = true;
              el.setAttribute('aria-hidden', 'true');
            };
            const restoreHostVisibility = () => {
              hostVisibilityOrigins.forEach((original, el) => {
                el.style.display = original.display;
                el.hidden = original.hidden;
                if (original.ariaHidden === null) el.removeAttribute('aria-hidden');
                else el.setAttribute('aria-hidden', original.ariaHidden);
              });
              hostVisibilityOrigins.clear();
            };

            // Hide the host preview badge, More launcher, catalog-provider
            // mode, and configured third-party provider cards. The custom API
            // mode remains available; the provider directory itself is intact.
            function hideHostOptions() {
              document.querySelectorAll<HTMLElement>(
                '[class*="previewBadge"], [data-preview-badge], [data-previewbadge]',
              ).forEach((el) => {
                setHostNodeVisible(el, false);
              });
              document.querySelectorAll<HTMLElement>('span, small, [class*="badge"], [class*="Badge"]').forEach((el) => {
                const label = (el.textContent || '').replace(/\s+/g, ' ').trim();
                if (label === '预览版') {
                  setHostNodeVisible(el, false);
                  return;
                }
                if (!/^(?:preview(?:\s+version)?)$/i.test(label)) return;
                setHostNodeVisible(el, false);
                setHostNodeVisible(el, false);
              });
              document.querySelectorAll<HTMLElement>(
                '.wtg9ga_panelRow[aria-haspopup="menu"], [class*="panelRow"][aria-haspopup="menu"]',
              ).forEach((el) => {
                const labels = [el.getAttribute('aria-label') || '', el.textContent || '']
                  .map((label) => label.replace(/\s+/g, ' ').trim());
                if (labels.some((label) => label === '更多')) {
                  setHostNodeVisible(el, false);
                  return;
                }
                if (!labels.some((label) => /^(?:more)$/i.test(label))) return;
                setHostNodeVisible(el, false);
                setHostNodeVisible(el, false);
              });
            }

            // #2 hide third-party model providers; the user-authored custom
            // model API stays. First collapse the built-in catalog mode, then
            // hide already-configured third-party cards in the host directory.
            const THIRD_PARTY = /anthropic|claude|openai|chatgpt|google|gemini|moonshot|kimi|zhipu|qwen|alibaba|baidu|ernie|cohere|mistral|groq|xai|grok|openrouter|azure|bedrock|vertex|together|fireworks|perplexity/i;
            const THIRD_PARTY_LOCALIZED = ['月之暗面', '智谱', '通义', '文心'];
            function hideThirdPartyProviders() {
              const tabs = [...document.querySelectorAll<HTMLElement>('[role="tab"]')];
              const tabLabel = (tab: HTMLElement) => (tab.textContent || '').replace(/\s+/g, ' ').trim();
              const isCatalogTab = (label: string) => {
                if (label === '第三方模型提供商' || label === '第三方模型供应商') return true;
                return /^third-party model provider$/i.test(label);
              };
              const isCustomTab = (label: string) => {
                if (label === '自定义模型 API') return true;
                return /^custom model API$/i.test(label);
              };
              const catalogTab = tabs.find((tab) => isCatalogTab(tabLabel(tab)));
              const customTab = tabs.find((tab) => isCustomTab(tabLabel(tab)));
              if (catalogTab) {
                if (catalogTab.getAttribute('aria-selected') === 'true' && customTab && !customTab.hasAttribute('disabled')) {
                  customTab.click();
                }
                const catalogPanelId = catalogTab.getAttribute('aria-controls');
                const catalogPanel = catalogPanelId ? document.getElementById(catalogPanelId) : null;
                if (catalogPanel instanceof HTMLElement) setHostNodeVisible(catalogPanel, false);
                const tabList = catalogTab.closest<HTMLElement>('[role="tablist"]');
                if (tabList) {
                  setHostNodeVisible(tabList, false);
                } else setHostNodeVisible(catalogTab, false);
              }
              document.querySelectorAll<HTMLElement>('.jrmgQW_rowName').forEach(n => {
                const name = n.textContent || '';
                const isVendor = THIRD_PARTY.test(name) || THIRD_PARTY_LOCALIZED.some((label) => name.includes(label));
                if (!isVendor) return;
                const row = n.closest<HTMLElement>('.jrmgQW_rowCard, .jrmgQW_setupCard, .jrmgQW_row, li');
                if (row) setHostNodeVisible(row, false);
              });
            }

            // #20 selectionAnnotation (ready, default off): select text in the
            // conversation → a 批注 pill appears → write the note → it is
            // inserted into the composer as a quoted block. Falls back to the
            // clipboard when no composer can be found. Entirely guarded so a
            // future DOM change cannot throw into the chrome loop.
            let annoCleanup: (() => void) | null = null;
            function initAnnotations() {
              let isOn = false;
              try {
                const f = JSON.parse(localStorage.getItem('dsh-ui-delta.modules') || '{}') || {};
                isOn = f.selectionAnnotation === true;
              } catch { isOn = false; }
              if (!isOn) {
                annoCleanup?.();
                annoCleanup = null;
                return;
              }
              if (annoCleanup) return;
              let btn: HTMLButtonElement | null = null;
              let panel: HTMLDivElement | null = null;
              const clear = () => { if (btn) { btn.remove(); btn = null; } if (panel) { panel.remove(); panel = null; } };
              // Annotations stay attached to their selected text until the host
              // accepts a send action, whether the user presses Enter or clicks.
              interface AnnoNote { quote: string; note: string; }
              const pendingNotes: AnnoNote[] = [];
              let isAnnotationSendInFlight = false;
              let annotationSendTimer: ReturnType<typeof setTimeout> | null = null;
              let chip: HTMLButtonElement | null = null;
              const renderChip = () => {
                if (!pendingNotes.length) { if (chip) { chip.remove(); chip = null; } return; }
                if (!chip) {
                  chip = document.createElement('button');
                  chip.type = 'button';
                  chip.className = 'ens-anno-chip';
                  chip.addEventListener('click', () => { pendingNotes.length = 0; renderChip(); });
                  document.body.appendChild(chip);
                }
                chip.textContent = `批注 ×${pendingNotes.length}`;
                chip.title = pendingNotes.map((n, i) => `${i + 1}. ${n.note}`).join('\n') + '\n\n点击清空';
              };
              const openPanel = (quoted: string, rect: DOMRect) => {
                if (btn) { btn.remove(); btn = null; }
                panel = document.createElement('div');
                panel.className = 'ens-anno-panel';
                panel.style.left = Math.min(window.innerWidth - 316, Math.max(8, rect.left)) + 'px';
                panel.style.top = Math.min(window.innerHeight - 220, rect.bottom + 8) + 'px';
                const quote = document.createElement('div');
                quote.className = 'ens-anno-quote';
                quote.textContent = quoted;
                const input = document.createElement('textarea');
                input.className = 'ens-anno-input';
                input.placeholder = '写下你的批注…';
                const actions = document.createElement('div');
                actions.className = 'ens-anno-actions';
                const ghost = document.createElement('button');
                ghost.type = 'button'; ghost.className = 'ens-anno-ghost'; ghost.textContent = '取消';
                const primary = document.createElement('button');
                primary.type = 'button'; primary.className = 'ens-anno-primary'; primary.textContent = '加入批注';
                ghost.addEventListener('click', clear);
                primary.addEventListener('click', () => {
                  const note = (input.value || '').trim();
                  pendingNotes.push({ quote: quoted.replace(/\n+/g, ' '), note });
                  renderChip();
                  clear();
                });
                actions.append(ghost, primary);
                panel.append(quote, input, actions);
                document.body.appendChild(panel);
                input.focus();
              };
              const onUp = (event: MouseEvent) => {
                if (panel) return;
                const target = event.target as Element | null;
                if (target?.closest('.ens-anno-panel, .ens-anno-btn')) return;
                const sel = window.getSelection();
                if (!sel) return;
                const text = String(sel).trim();
                if (!text || text.length < 2) return;
                const anchor = sel.anchorNode;
                const host = anchor ? (anchor.nodeType === 1 ? (anchor as Element) : anchor.parentElement) : null;
                if (!host || !(host instanceof Element) || !(host.closest('.V4vHZW_column, .an3WzG_body, [data-conversation-scroll]'))) return;
                let rect: DOMRect | null = null;
                try { rect = sel.getRangeAt(0).getBoundingClientRect(); } catch { return; }
                if (!rect || (!rect.width && !rect.height)) return;
                clear();
                btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'ens-anno-btn';
                btn.textContent = '＋ 批注';
                btn.style.left = Math.max(8, rect.left + rect.width / 2 - 32) + 'px';
                btn.style.top = Math.max(8, rect.top - 36) + 'px';
                btn.addEventListener('mousedown', (ev: MouseEvent) => ev.preventDefault());
                btn.addEventListener('click', () => openPanel(text, rect));
                document.body.appendChild(btn);
              };
              document.addEventListener('mouseup', onUp, true);
              // v0.2.1: the floating 批注 button follows the selection — it goes once
              // the selection is empty or the page scrolls, so it never sits in a
              // stale place over unrelated text.
              const dropButton = () => { if (panel) return; if (btn) { btn.remove(); btn = null; } };
              const onSelChange = () => {
                const sel = window.getSelection();
                if (!sel || sel.isCollapsed || String(sel).trim() === '') dropButton();
              };
              document.addEventListener('selectionchange', onSelChange);
              document.addEventListener('scroll', dropButton, true);
              const normalizeMessageText = (value: string) => value.replace(/\s+/g, ' ').trim();
              const annotationText = ({ quote, note }: AnnoNote) => {
                if (!note || note.includes(quote)) return note || quote;
                if (/^\u4ec0\u4e48\u610f\u601d[\uff1f?\uff01!\u3002.]?$/.test(note)) {
                  return `${quote}是${note}`;
                }
                const isAdjacent = /[\u3400-\u9fff]$/.test(quote) && /^[\u3400-\u9fff\p{P}]/u.test(note);
                return `${quote}${isAdjacent ? '' : ' '}${note}`;
              };
              const annotationBlock = (notes: AnnoNote[]) => notes.map(annotationText).join('\n\n');
              const submitAnnotations = (el: HTMLElement) => {
                if (!pendingNotes.length || isAnnotationSendInFlight) return;
                const notes = pendingNotes.slice();
                const block = annotationBlock(notes);
                let draft = readComposer(el);
                const hasEveryAnnotation = (value: string) => {
                  const normalized = normalizeMessageText(value);
                  return notes.every((n) => normalized.includes(normalizeMessageText(n.quote))
                    && normalized.includes(normalizeMessageText(n.note)));
                };
                // A retry after a delayed host render must not prepend the same
                // quote and note a second time.
                if (!hasEveryAnnotation(draft)) {
                  const separator = draft ? (el.isContentEditable ? '\n' : '\n\n') : '';
                  if (!prependComposer(el, block + separator)) return;
                }
                isAnnotationSendInFlight = true;
                let waited = 0;
                const press = () => {
                  annotationSendTimer = null;
                  if (!notes.every((note, index) => pendingNotes[index] === note)) {
                    isAnnotationSendInFlight = false;
                    return;
                  }
                  draft = readComposer(el);
                  const send = document.querySelector<HTMLButtonElement>('.GRgSLq_primary');
                  if (hasEveryAnnotation(draft) && send && !send.disabled) {
                    // The in-flight guard lets this synthetic click reach the
                    // host handler without running annotation injection again.
                    send.click();
                    pendingNotes.splice(0, notes.length);
                    renderChip();
                    isAnnotationSendInFlight = false;
                    return;
                  }
                  waited += 50;
                  if (waited >= 1000) {
                    isAnnotationSendInFlight = false;
                    return; // Keep the chip so the user can retry.
                  }
                  annotationSendTimer = setTimeout(press, 50);
                };
                annotationSendTimer = setTimeout(press, 50);
              };
              // Enter and the composer send button share the same guarded path.
              const onAnnoKey = (e: KeyboardEvent) => {
                if (e.key !== 'Enter' || e.shiftKey || e.isComposing || !pendingNotes.length) return;
                const el = composerEl();
                const target = e.target as Node | null;
                if (!el || !(target === el || el.contains(target))) return;
                e.preventDefault();
                e.stopImmediatePropagation();
                submitAnnotations(el);
              };
              const onAnnoSendClick = (e: MouseEvent) => {
                if (!pendingNotes.length || isAnnotationSendInFlight) return;
                const target = e.target as Element | null;
                if (!target?.closest('.GRgSLq_primary')) return;
                const el = composerEl();
                if (!el) return;
                e.preventDefault();
                e.stopImmediatePropagation();
                submitAnnotations(el);
              };
              document.addEventListener('keydown', onAnnoKey, true);
              document.addEventListener('click', onAnnoSendClick, true);
              annoCleanup = () => {
                document.removeEventListener('mouseup', onUp, true);
                document.removeEventListener('keydown', onAnnoKey, true);
                document.removeEventListener('click', onAnnoSendClick, true);
                document.removeEventListener('selectionchange', onSelChange);
                document.removeEventListener('scroll', dropButton, true);
                if (annotationSendTimer) clearTimeout(annotationSendTimer);
                clear();
                if (chip) { chip.remove(); chip = null; }
              };
            }

            // v0.2.1 — design-layer dropdown for host <select>s: the browser draws
            // its own popup with the OS palette, which never matches Delta. This
            // opens a Delta-styled listbox on the select, writes through value +
            // input/change, and gives keyboard nav + click-out close. It is purely
            // additive: a select without options or a missing owner is a no-op.
            const SEL = 'select.jrmgQW_selectInput, [class*="jrmgQW_"] select:not([class*="ens-"])';
            let isSelectWired = false;
            const initDeltaSelect = () => {
              if (isSelectWired) return;
              isSelectWired = true;
              let menu: HTMLDivElement | null = null;
              let owner: HTMLSelectElement | null = null;
              let active = -1;
              const close = () => {
                if (menu) { menu.remove(); menu = null; owner = null; active = -1; }
              };
              const paint = (items: HTMLDivElement[], sel: number, ix: number) => {
                items.forEach((el, i) => {
                  el.classList.toggle('ens-menu-active', i === ix);
                  el.setAttribute('aria-selected', i === sel ? 'true' : 'false');
                });
              };
              const open = (select: HTMLSelectElement) => {
                close();
                const opts = [...select.options];
                if (!opts.length) return;
                owner = select;
                const sel = select.selectedIndex;
                active = Math.max(0, sel);
                const menuEl = document.createElement('div');
                menu = menuEl;
                menuEl.className = 'ens-menu';
                menuEl.setAttribute('role', 'listbox');
                opts.forEach((o, i) => {
                  const it = document.createElement('div');
                  it.className = 'ens-menu-item';
                  it.setAttribute('role', 'option');
                  it.textContent = o.textContent;
                  it.addEventListener('mouseenter', () => { active = i; paint(items, sel, active); });
                  it.addEventListener('click', (ev: MouseEvent) => { ev.preventDefault(); pick(select, i); close(); select.focus(); });
                  menuEl.appendChild(it);
                });
                const items = [...menuEl.children] as HTMLDivElement[];
                paint(items, sel, active);
                document.body.appendChild(menu);
                const r = select.getBoundingClientRect();
                menu.style.minWidth = r.width + 'px';
                menu.style.left = r.left + 'px';
                menu.style.top = (r.bottom + 4) + 'px';
                const into = menu.querySelector<HTMLElement>('.ens-menu-active');
                if (into) into.scrollIntoView({ block: 'nearest' });
              };
              const pick = (select: HTMLSelectElement, i: number) => {
                if (i === select.selectedIndex) return;
                select.selectedIndex = i;
                select.dispatchEvent(new Event('input', { bubbles: true }));
                select.dispatchEvent(new Event('change', { bubbles: true }));
              };
              // the native popup is the OS palette — suppress it and draw ours
              document.addEventListener('mousedown', (ev: MouseEvent) => {
                const target = ev.target as Element | null;
                const select = target?.closest<HTMLSelectElement>(SEL) ?? null;
                if (!select) { if (menu) close(); return; }
                ev.preventDefault();
                select.focus();
                open(select);
              }, true);
              document.addEventListener('keydown', (ev: KeyboardEvent) => {
                if (menu && owner) {
                  const items = [...menu.children] as HTMLDivElement[];
                  if (ev.key === 'ArrowDown') { active = (active + 1) % items.length; paint(items, owner.selectedIndex, active); ev.preventDefault(); return; }
                  if (ev.key === 'ArrowUp') { active = (active - 1 + items.length) % items.length; paint(items, owner.selectedIndex, active); ev.preventDefault(); return; }
                  if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pick(owner, active); close(); owner.focus(); return; }
                  if (ev.key === 'Escape' || ev.key === 'Tab') { close(); if (ev.key === 'Escape') { ev.preventDefault(); owner.focus(); } return; }
                  return;
                }
                // no menu open: Enter / Space on a focused select opens the Delta menu
                const target = ev.target as Element | null;
                const select = target?.closest<HTMLSelectElement>(SEL) ?? null;
                if (select && (ev.key === 'Enter' || ev.key === ' ')) {
                  ev.preventDefault();
                  open(select);
                }
              }, true);
              window.addEventListener('scroll', (ev: Event) => {
                if (menu && !(ev.target instanceof Element && ev.target.closest('.ens-menu'))) close();
              }, true);
              window.addEventListener('resize', close);
            };

            // v0.2.1 — settings window can be resized from its bottom-right corner
            // (the host fixes it at 800px). The size is kept per viewer in
            // localStorage; double-click or Home resets it to the default.
            const RESIZE_KEY = 'dsh-ui-delta.settingsSize';
            const readSize = () => { try { return JSON.parse(localStorage.getItem(RESIZE_KEY) || 'null'); } catch { return null; } };
            const writeSize = (s: { w: number; h: number } | null) => { try { if (s) localStorage.setItem(RESIZE_KEY, JSON.stringify(s)); else localStorage.removeItem(RESIZE_KEY); } catch { /* keep the size for this session */ } };
            const panelBounds = () => ({ maxW: window.innerWidth - 48, maxH: window.innerHeight - 48 });
            const setPanelSize = (panel: HTMLElement, w: number, h: number) => {
              const { maxW, maxH } = panelBounds();
              panel.style.width = Math.round(Math.min(maxW, Math.max(560, w))) + 'px';
              panel.style.height = Math.round(Math.min(maxH, Math.max(420, h))) + 'px';
            };
            const mountSettingsResize = () => {
              const panel = document.querySelector<HTMLElement>('.AnXs9G_panel');
              if (!panel || panel.querySelector<HTMLElement>('.ens-resize')) return;
              const grip = document.createElement('div');
              grip.className = 'ens-resize';
              grip.tabIndex = 0;
              grip.setAttribute('role', 'button');
              grip.setAttribute('aria-label', '拖动调整窗口大小，双击恢复默认');
              grip.title = '拖动调整窗口大小，双击恢复默认';
              grip.innerHTML = '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M9 3 3 9M9 6 6 9" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';
              panel.appendChild(grip);
              const saved = readSize();
              if (saved) setPanelSize(panel, saved.w, saved.h);
              const commit = () => writeSize({ w: parseInt(panel.style.width, 10), h: parseInt(panel.style.height, 10) });
              const reset = () => { panel.style.width = ''; panel.style.height = ''; writeSize(null); };
              grip.addEventListener('pointerdown', (ev: PointerEvent) => {
                ev.preventDefault();
                const rect = panel.getBoundingClientRect();
                grip.setPointerCapture(ev.pointerId);
                const move = (e: PointerEvent) => {
                  // the panel is centred, so the corner follows the pointer at twice the drag distance
                  setPanelSize(panel, rect.width + (e.clientX - ev.clientX) * 2, rect.height + (e.clientY - ev.clientY) * 2);
                };
                const up = () => {
                  grip.removeEventListener('pointermove', move);
                  grip.removeEventListener('pointerup', up);
                  grip.removeEventListener('pointercancel', up);
                  commit();
                };
                grip.addEventListener('pointermove', move);
                grip.addEventListener('pointerup', up);
                grip.addEventListener('pointercancel', up);
              });
              grip.addEventListener('dblclick', reset);
              grip.addEventListener('keydown', (ev: KeyboardEvent) => {
                const step = ev.shiftKey ? 48 : 16;
                const rect = panel.getBoundingClientRect();
                if (ev.key === 'ArrowLeft') setPanelSize(panel, rect.width - step, rect.height);
                else if (ev.key === 'ArrowRight') setPanelSize(panel, rect.width + step, rect.height);
                else if (ev.key === 'ArrowUp') setPanelSize(panel, rect.width, rect.height - step);
                else if (ev.key === 'ArrowDown') setPanelSize(panel, rect.width, rect.height + step);
                else if (ev.key === 'Home') reset();
                else return;
                ev.preventDefault();
                commit();
              });
            };

            let isTicking = false;
            // v0.2.2: the version check runs once per page load, not on every render
            // React to account sign-in / sign-out so 登录 shows/hides live.
            let unsubAccount: (() => void) | null = null;
            const wireAccount = () => {
              if (unsubAccount) return;
              try {
                const unsub = launcherOps()?.hooks?.account?.subscribe?.(syncLoginVisibility);
                if (typeof unsub === 'function') unsubAccount = unsub as () => void;
              } catch { /* retry on the next run */ }
            };
            const run = () => {
              isTicking = false;
              try {
                // the top brand row stays a clean drag strip: no buttons there
                document.querySelectorAll<HTMLElement>('.ens-top-actions').forEach((el) => el.remove());
                initAnnotations();
                mountFootSettings();
                mountVersionAction();
                mountSearchDock();
                hideHostOptions();
                hideThirdPartyProviders();
                renameLabels();
                document.querySelectorAll<HTMLElement>('._5Qcc8a_trigger').forEach(injectAccountGlyph);
                wireAccount();
                syncLoginVisibility();
                hideAccountModels();
                hideListedModels();
                installContentSearch();
                applyPrivacyAndFold();
                initDeltaSelect();
                mountSettingsResize();
              } catch { /* never abort */ }
            };
            const schedule = () => { if (isTicking) return; isTicking = true; requestAnimationFrame(run); };
            window.addEventListener('dsh-ui-delta:flags-changed', schedule);

            // v0.1.0: privacy — stop the host's UI analytics at the front end (module
            // blockAnalytics, on by default). The backend's own collection is not touched.
            // Also marks the root for the foldErrors CSS. Both read module flags from storage.
            const flagOn = (id: string, isDflt: boolean) => {
              try {
                const f = JSON.parse(localStorage.getItem('dsh-ui-delta.modules') || '{}');
                return f[id] === undefined ? isDflt : f[id] === true;
              } catch { return isDflt; }
            };
            let originalTrack: Function | null = null;
            const applyPrivacyAndFold = () => {
              const block = flagOn('blockAnalytics', true);
              try {
                const pa = typeof ctx.get === 'function' ? ctx.get('productAnalytics') : null;
                if (pa && typeof (pa as { track?: unknown }).track === 'function') {
                  const paTrack = (pa as { track: Function & { name: string } }).track;
                  if (block && paTrack.name !== 'deltaNoop') {
                    originalTrack = originalTrack || paTrack;
                    (pa as { track: Function }).track = function deltaNoop() {};
                  } else if (!block && originalTrack && paTrack.name === 'deltaNoop') {
                    (pa as { track: Function }).track = originalTrack;
                  }
                }
              } catch { /* read-only service: nothing to block */ }
              document.documentElement.toggleAttribute('data-ens-fold-errors', flagOn('foldErrors', true));
            };
            // click a turn-failure row to expand or fold its detail
            const onErrorRowClick = (e: MouseEvent) => {
              const row = e.target instanceof Element ? e.target.closest('.LOmM4q_turnErrorRow') : null;
              if (!row || e.target instanceof Element && e.target.closest('a, button, input, textarea')) return;
              if (row.hasAttribute('data-ens-open')) row.removeAttribute('data-ens-open');
              else row.setAttribute('data-ens-open', '');
            };
            document.addEventListener('click', onErrorRowClick, true);

            // v0.1.0: vision bridge (visionBridge switch, off by default). Only a pasted
            // image goes out, and only to the vision model the user configured.
            const insertComposer = (text: string) => {
              const el = document.querySelector<HTMLElement>('.GRgSLq_input') || document.querySelector<HTMLElement>('[contenteditable="true"]') || document.querySelector<HTMLElement>('textarea');
              if (!el) return false;
              try {
                if (el.isContentEditable) {
                  el.focus();
                  document.execCommand('insertText', false, text);
                  return true;
                }
                if ('value' in el) {
                  const setter = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value')?.set;
                  if (setter) setter.call(el, (el.value || '') + text); else el.value = (el.value || '') + text;
                  el.dispatchEvent(new Event('input', { bubbles: true }));
                  el.focus();
                  return true;
                }
              } catch { /* fall through */ }
              return false;
            };
            // v0.1.0: earlier builds kept API keys in browser storage; clear any left behind.
            try {
              localStorage.removeItem('dsh-ui-delta.vision');
              localStorage.removeItem('dsh-ui-delta.search');
              sessionStorage.removeItem('dsh-ui-delta.vision.secret');
              sessionStorage.removeItem('dsh-ui-delta.search.secret');
            } catch { /* storage unavailable */ }
            // the image goes to the host, which calls the vision model configured there
            const recognizeImage = async (file: File) => {
              const res = await fetch('/dsh-ui-delta/vision', { method: 'POST', headers: { 'Content-Type': file.type }, body: file });
              const data = await res.json().catch(() => ({}));
              if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
              return String(data.text || '');
            };
            /**
             * Footer notice for progress and errors.
             *
             * Errors and progress used to be written into the composer as text, which
             * landed the message in the wrong place (mid-draft, and easy to send by
             * accident). They now surface above the footer actions.
             * The pill is hidden entirely when there is nothing to say — no empty
             * placeholder, no version stamp.
             */
            let noticeTimer: ReturnType<typeof setTimeout> | null = null;
            const showNotice = (kind: string, text: string, isSticky: boolean) => {
              const pill = document.querySelector<HTMLElement>('.ens-foot-notify');
              if (!pill || !text) return;
              const span = pill.querySelector<HTMLElement>('span');
              if (span) span.textContent = text;
              pill.classList.remove('error', 'warn', 'info');
              if (kind) pill.classList.add(kind);
              pill.setAttribute('role', kind === 'error' ? 'alert' : 'status');
              pill.classList.add('visible');
              pill.title = text;
              if (noticeTimer) { clearTimeout(noticeTimer); noticeTimer = null; }
              if (!isSticky) {
                noticeTimer = setTimeout(() => {
                  pill.classList.remove('visible');
                  noticeTimer = null;
                }, 4200);
              }
            };
            const hideNotice = () => {
              if (noticeTimer) { clearTimeout(noticeTimer); noticeTimer = null; }
              const pill = document.querySelector<HTMLElement>('.ens-foot-notify');
              if (pill) pill.classList.remove('visible');
            };

            const onVisionPaste = (e: ClipboardEvent) => {
              if (!flagOn('visionBridge', false)) return;
              const target = e.target as Element | null;
              const inComposer = target?.closest('.GRgSLq_card, [contenteditable="true"], textarea') ?? null;
              if (!inComposer) return;
              const clipboardData = e.clipboardData;
              if (!clipboardData) return;
              const images = [...clipboardData.items].filter((it) => it.kind === 'file' && it.type.startsWith('image/'));
              if (!images.length || clipboardData.getData('text').length) return;
              e.preventDefault();
              e.stopImmediatePropagation();
              const files = images.map((it) => it.getAsFile()).filter((f): f is File => f !== null);
              if (!files.length) return;
              showNotice('info', t(`正在识别 ${files.length} 张图片…`, `Recognising ${files.length} image${files.length > 1 ? 's' : ''}…`), true);
              // several images may be pasted at once; each one is recognised on its
              // own and the recognised text is appended in the order they arrived
              let pending = files.length;
              let isFailed = false;
              files.forEach((file) => {
                recognizeImage(file)
                  .then((text) => insertComposer(`\n[图片内容]\n${text}\n`))
                  .catch((err) => { isFailed = true; showNotice('error', t(`图片识别失败：${err?.message || err}`, `Image recognition failed (${err?.message || err})`), true); })
                  .finally(() => {
                    pending -= 1;
                    if (pending === 0 && !isFailed) hideNotice();
                  });
              });
            };
            document.addEventListener('paste', onVisionPaste, true);

            // shared composer access (vision bridge, annotations and search all use it)
            const composerEl = () => document.querySelector<HTMLElement>('.GRgSLq_input') || document.querySelector<HTMLElement>('[contenteditable="true"]') || document.querySelector<HTMLElement>('textarea');
            const readComposer = (el: HTMLElement) => (el.isContentEditable ? (el.innerText || el.textContent || '') : ((el as HTMLTextAreaElement).value || '')) || '';
            // Insert only the annotation prefix, so existing editor references
            // and other structured draft content remain owned by the host.
            const prependComposer = (el: HTMLElement, text: string) => {
              if (!el.isContentEditable) return writeComposer(el, text + readComposer(el));
              try {
                el.focus();
                const sel = window.getSelection();
                if (!sel) return false;
                const range = document.createRange();
                range.selectNodeContents(el);
                range.collapse(true);
                sel.removeAllRanges();
                sel.addRange(range);
                return document.execCommand('insertText', false, text);
              } catch { return false; }
            };
            /**
             * Write text into the host's composer so the host's own state sees it.
             *
             * v0.2.2 fix: assigning `textContent` (or `.value`) directly updates the
             * DOM but not the editor's internal model, so a React-controlled composer
             * sent the *old* text and the annotation block was silently dropped —
             * annotations could be written but never reached the conversation. The
             * paths below go through the browser's editing pipeline instead:
             * `execCommand('insertText')` fires beforeinput/input on a contenteditable,
             * and a native value setter + input event does the same for a textarea.
             */
            const writeComposer = (el: HTMLElement, text: string) => {
              try {
                if (el.isContentEditable) {
                  el.focus();
                  const sel = window.getSelection();
                  if (!sel) return false;
                  const range = document.createRange();
                  range.selectNodeContents(el);
                  range.collapse(true);
                  sel.removeAllRanges();
                  sel.addRange(range);
                  // execCommand is the only API that reaches a React/contenteditable
                  // model; it is deprecated but universally implemented in Chromium.
                  if (!document.execCommand('insertText', false, text)) {
                    el.textContent = text;
                    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
                  }
                  return true;
                }
                const setter = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value')?.set;
                if (setter) setter.call(el, text); else (el as HTMLTextAreaElement).value = text;
                el.dispatchEvent(new Event('input', { bubbles: true }));
                return true;
              } catch { return false; }
            };

            // Web search uses a configured independent service, or the native Host web seam.
            // "/search keywords" + Enter fills
            // the results into the composer; nothing is sent automatically.
            const onSearchKey = (e: KeyboardEvent) => {
              if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
              if (!flagOn('webSearch', true)) return;
              const el = composerEl();
              const target = e.target as Node | null;
              if (!el || !(target === el || el.contains(target))) return;
              const m = readComposer(el).trim().match(/^\/search\s+([\s\S]+)$/);
              if (!m) return;
              e.preventDefault();
              e.stopImmediatePropagation();
              const query = m[1].trim();
              writeComposer(el, `正在搜索：${query} …`);
              showNotice('info', t(`正在搜索：${query}`, `Searching: ${query}`), true);
              fetch('/dsh-ui-delta/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) })
                .then(async (res) => {
                  const data = await res.json().catch(() => ({}));
                  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
                  return data.results || [];
                })
                .then((results) => {
                  const lines = results.map((x: { title: string; url: string; content: string }, i: number) => `${i + 1}. ${x.title}\n   ${x.url}\n   ${x.content}`).join('\n');
                  writeComposer(el, `[网络搜索结果：${query}]\n${lines || '（无结果）'}\n\n请基于以上结果回答：${query}`);
                  hideNotice();
                })
                .catch((err) => {
                  // the query stays in the composer so it can be retried; the reason
                  // goes to the notice pill instead of into the draft
                  writeComposer(el, `/search ${query}`);
                  showNotice('error', t(`搜索失败：${err?.message || err}`, `Search failed: ${err?.message || err}`), true);
                });
            };
            document.addEventListener('keydown', onSearchKey, true);

            // v0.1.0: export the visible conversation as a Markdown file. Local only.
            const exportConversation = () => {
              const col = document.querySelector<HTMLElement>('.V4vHZW_column') || document.querySelector<HTMLElement>('[data-conversation-scroll]');
              const text = (col && col.innerText ? col.innerText : '').trim();
              if (!text) return;
              const blob = new Blob([`# 对话记录\n\n${text}\n`], { type: 'text/markdown;charset=utf-8' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = `对话-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.md`;
              a.click();
              setTimeout(() => URL.revokeObjectURL(a.href), 1000);
            };
            window.__deltaExportConversation = exportConversation;

            // v0.1.0: removes two host options from view. (1) The add-model dialog's
            const hideListedModels = () => {
              let names: string[] = [];
              try {
                names = (localStorage.getItem('dsh-ui-delta.hiddenModels') || '')
                  .split(/[,，]/).map((entry) => entry.trim().toLowerCase()).filter(Boolean);
              } catch { names = []; }
              document.querySelectorAll<HTMLElement>('[data-model-id]').forEach((row) => {
                const modelName = (row.textContent || '').trim().toLowerCase();
                const hidden = names.some((name) => modelName === name ||
                  (modelName.startsWith(name) && !/[a-z]/i.test(modelName.charAt(name.length))));
                const display = hidden ? 'none' : '';
                if (row.style.display !== display) row.style.display = display;
              });
            };

            const builtInModelRows = new Set<HTMLElement>();
            const hideAccountModels = () => {
              builtInModelRows.forEach((row) => { if (!row.isConnected) builtInModelRows.delete(row); });
              let isVisible = false;
              try { isVisible = JSON.parse(localStorage.getItem('dsh-ui-delta.modules') || '{}').accountModels === true; }
              catch { isVisible = false; }
              document.querySelectorAll<HTMLElement>('[role="menu"] [data-provider-id="deepseek-account"], [role="menu"] [data-provider-id="deepseek-official"]').forEach((modelLabel) => {
                const item = modelLabel.closest<HTMLElement>('[role="menuitemradio"]') || modelLabel;
                setHostNodeVisible(item, isVisible);
                const group = item.closest<HTMLElement>('[role="group"][data-menu-group]');
                if (!group) return;
                const hasVisibleModel = [...group.querySelectorAll<HTMLElement>('[role="menuitemradio"]')]
                  .some((candidate) => candidate.style.display !== 'none' && !candidate.hidden);
                setHostNodeVisible(group, isVisible || hasVisibleModel);
              });
              document.querySelectorAll<HTMLElement>('.jrmgQW_rowCard, .jrmgQW_setupCard').forEach((row) => {
                const name = row.querySelector<HTMLElement>('.jrmgQW_rowName')?.textContent?.trim();
                const isCustom = !!row.querySelector('.jrmgQW_rowTag');
                const setupRoute = row.querySelector<HTMLElement>('.jrmgQW_editorRoute')?.textContent?.trim();
                const isBuiltIn = !!row.querySelector('.jrmgQW_accountStatus')
                  || (!isCustom && /^deepseek$/i.test(name || ''))
                  || (row.matches('.jrmgQW_setupCard') && setupRoute === 'deepseek-official');
                if (isBuiltIn) {
                  builtInModelRows.add(row);
                  setHostNodeVisible(row, isVisible);
                } else if (builtInModelRows.delete(row)) {
                  setHostNodeVisible(row, true);
                }
              });
            };

            interface SearchHit { sessionId: string; snippet: string; }
            interface SearchResponse {
              ok: boolean;
              value?: { items: SearchHit[]; hasMore: boolean };
              [key: string]: unknown;
            }
            interface SearchService {
              search: (query: string, signal: AbortSignal) => Promise<SearchResponse>;
              searchResultLimit?: number;
              list: { getSnapshot: () => { ids: string[]; byId: Record<string, { blank?: boolean; origin?: string }> } };
            }
            interface HistoryRecord { event?: { type?: string; seq?: number; data?: unknown }; }
            interface HistoryGateway {
              session?: { events?: (request: unknown, signal: AbortSignal) => Promise<{
                ok: boolean; value?: { records: HistoryRecord[]; hasMore: boolean };
              }> };
            }
            const searchMessageText = (record: HistoryRecord) => {
              const event = record.event;
              if (!event || (event.type !== 'user/message' && event.type !== 'assistant/message')) return '';
              if (!event.data || typeof event.data !== 'object') return '';
              const data = event.data as { content?: unknown; message?: { content?: unknown } };
              const content = event.type === 'user/message' ? data.content : data.message?.content;
              if (typeof content === 'string') return content;
              if (!Array.isArray(content)) return '';
              return content.map((block: unknown) => {
                if (!block || typeof block !== 'object') return '';
                const item = block as { type?: unknown; text?: unknown };
                return item.type === 'text' && typeof item.text === 'string' ? item.text : '';
              }).join('');
            };
            let restoreContentSearch: (() => void) | null = null;
            // The host's word index can miss a substring inside a Chinese sentence.
            // Supplement it through the same authorized, passive history API the
            // client uses, without persisting or exposing a separate index.
            const installContentSearch = () => {
              if (restoreContentSearch) return;
              try {
                const service = (ctx.get?.('sessions') || ctx.sessions) as SearchService | undefined;
                const remote = (ctx.get?.('remote') || ctx.remote) as HistoryGateway | undefined;
                if (!service || typeof service.search !== 'function' || typeof service.list?.getSnapshot !== 'function'
                  || typeof remote?.session?.events !== 'function') return;
                const original = service.search;
                const ownDescriptor = Object.getOwnPropertyDescriptor(service, 'search');
                const pendingScans = new Set<AbortController>();
                let isSearchActive = true;
                const wrapped: SearchService['search'] = async (query, signal) => {
                  const base = await original.call(service, query, signal);
                  const needle = query.trim().toLocaleLowerCase();
                  if (signal.aborted || !needle) return base;
                  const existing = base.ok && base.value ? base.value.items : [];
                  const configuredLimit = service.searchResultLimit;
                  const limit = typeof configuredLimit === 'number' && Number.isSafeInteger(configuredLimit)
                    ? Math.min(100, Math.max(1, configuredLimit)) : 20;
                  if (existing.length >= limit) return base;
                  let snapshot: ReturnType<SearchService['list']['getSnapshot']>;
                  try { snapshot = service.list.getSnapshot(); } catch { return base; }
                  if (!Array.isArray(snapshot.ids) || !snapshot.byId) return base;
                  const seen = new Set(existing.map((item) => item.sessionId));
                  const ids = snapshot.ids.filter((id) => {
                    const item = snapshot.byId[id];
                    return item && !item.blank && item.origin !== 'subagent' && !seen.has(id);
                  });
                  const found: Array<{ index: number; hit: SearchHit }> = [];
                  const controller = new AbortController();
                  pendingScans.add(controller);
                  const cancel = () => controller.abort();
                  signal.addEventListener('abort', cancel, { once: true });
                  if (signal.aborted || !isSearchActive) controller.abort();
                  const timer = setTimeout(cancel, 10000);
                  let next = 0;
                  let readCount = 0;
                  let hasReadFailure = false;
                  const worker = async () => {
                    while (!controller.signal.aborted && next < ids.length && existing.length + found.length < limit) {
                      const index = next++;
                      const sessionId = ids[index];
                      let beforeSeq: number | undefined;
                      while (!controller.signal.aborted) {
                        try {
                          const response = await remote.session!.events!({
                            address: { kind: 'session', sessionId }, maxMessages: 100,
                            ...(beforeSeq === undefined ? {} : { beforeSeq }),
                          }, controller.signal);
                          if (!response.ok || !response.value || !Array.isArray(response.value.records)) { hasReadFailure = true; break; }
                          readCount++;
                          const records = response.value.records;
                          const matched = records.map(searchMessageText).find((text) => text.toLocaleLowerCase().includes(needle));
                          if (matched !== undefined) {
                            const at = matched.toLocaleLowerCase().indexOf(needle);
                            const start = Math.max(0, at - 60);
                            const end = Math.min(matched.length, at + needle.length + 100);
                            found.push({ index, hit: { sessionId, snippet: `${start ? '…' : ''}${matched.slice(start, end)}${end < matched.length ? '…' : ''}` } });
                            break;
                          }
                          if (!response.value.hasMore) break;
                          const seqs = records.map((record) => record.event?.seq).filter((seq): seq is number => Number.isSafeInteger(seq));
                          if (!seqs.length) { hasReadFailure = true; break; }
                          const nextBefore = Math.min(...seqs);
                          if (beforeSeq !== undefined && nextBefore >= beforeSeq) { hasReadFailure = true; break; }
                          beforeSeq = nextBefore;
                        } catch {
                          if (!controller.signal.aborted) hasReadFailure = true;
                          break;
                        }
                      }
                    }
                  };
                  try { await Promise.all(Array.from({ length: Math.min(4, ids.length) }, worker)); }
                  finally { clearTimeout(timer); signal.removeEventListener('abort', cancel); pendingScans.delete(controller); }
                  if (signal.aborted || !isSearchActive) return base;
                  const isIncomplete = hasReadFailure || controller.signal.aborted;
                  if (isIncomplete) showNotice('warn', t('部分会话正文未能搜索，请重试', 'Some conversation content could not be searched; try again'), false);
                  if (!base.ok && !found.length) return base;
                  found.sort((a, b) => a.index - b.index);
                  const combined = [...existing, ...found.map((item) => item.hit)];
                  return { ok: true, value: {
                    items: combined.slice(0, limit),
                    hasMore: !!base.value?.hasMore || combined.length > limit || next < ids.length || isIncomplete,
                  } };
                };
                service.search = wrapped;
                if (Object.getOwnPropertyDescriptor(service, 'search')?.value !== wrapped) return;
                restoreContentSearch = () => {
                  isSearchActive = false;
                  pendingScans.forEach((controller) => controller.abort());
                  if (Object.getOwnPropertyDescriptor(service, 'search')?.value !== wrapped) return;
                  if (ownDescriptor) Object.defineProperty(service, 'search', ownDescriptor);
                  else delete (service as Partial<SearchService>).search;
                };
              } catch { /* The host may not expose passive history to this client. */ }
            };

            // v0.1.0: the working status reads 任务执行中 instead of the host's
            // 深度求索中. Text-only swap, so the duration and the rest of the line stay.
            let isStatusTicking = false;
            const renameStatusText = () => {
              isStatusTicking = false;
              try {
                const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
                for (let node = walker.nextNode(); node; node = walker.nextNode()) {
                  if (node.nodeValue && node.nodeValue.includes('深度求索中')) {
                    node.nodeValue = node.nodeValue.replace(/深度求索中/g, '任务执行中');
                  }
                }
              } catch { /* never abort */ }
            };
            const scheduleStatusRename = () => {
              if (isStatusTicking) return;
              isStatusTicking = true;
              requestAnimationFrame(renameStatusText);
            };

            run();
            const mo = new MutationObserver(schedule);
            mo.observe(document.body, { childList: true, subtree: true });
            // characterData: the status line updates its seconds in place
            const moStatus = new MutationObserver(scheduleStatusRename);
            moStatus.observe(document.body, { childList: true, subtree: true, characterData: true });
            scheduleStatusRename();

            return () => { mo.disconnect(); moStatus.disconnect(); if (noticeTimer) clearTimeout(noticeTimer); restoreNativeSearch(); restoreVersionActions(); restoreHostVisibility(); restoreContentSearch?.(); document.querySelectorAll('.ens-foot-actions').forEach(el => el.remove()); document.querySelectorAll('._5Qcc8a_root[data-ens-balance]').forEach(el => el.removeAttribute('data-ens-balance')); document.documentElement.removeAttribute('data-ens-fold-errors'); document.removeEventListener('click', onErrorRowClick, true); document.removeEventListener('paste', onVisionPaste, true); document.removeEventListener('keydown', onSearchKey, true); window.removeEventListener('dsh-ui-delta:flags-changed', schedule); unsubAccount?.(); annoCleanup?.(); };
          }, 'dsh-ui-delta: chrome');
        } catch (error) {
          console.warn('[dsh-ui-delta] chrome layer unavailable:', error);
        }

        // ── Feature modules (#16-#25, #27) ────────────────────────────────
        // One registry drives both the settings UI and the runtime gates. The
        // ids are semantic (what the module does, not which upstream repo it
        // came from); `ready` marks modules implemented today, everything else
        // is listed as planned so the switch is never a placebo.
        interface ModuleDef {
  id: string;
  zh: string;
  en: string;
  status: string;
  defaultOn?: boolean;
  zhDesc: string;
  enDesc: string;
}
const MODULES: ModuleDef[] = [
          { id: 'conversationShare', zh: '对话分享', en: 'Share conversations', status: 'ready', defaultOn: true,
            zhDesc: '把当前对话复制为 Markdown 文本。',
            enDesc: 'Copy the current conversation as Markdown.' },
          { id: 'selectionAnnotation', zh: '选中批注', en: 'Selection annotations', status: 'ready', defaultOn: false,
            zhDesc: '选中正文即可批注，多条批注累积；发送时将选中内容和批注组合为问题。',
            enDesc: 'Select text to annotate; the selected text and notes are combined when you send.' },
          { id: 'accountModels', zh: '显示 DeepSeek 自带模型', en: 'Show built-in DeepSeek models', status: 'ready', defaultOn: false,
            zhDesc: '默认隐藏 DeepSeek 自带的模型和设置项；开启后显示。',
            enDesc: 'Hide built-in DeepSeek models and their settings by default; turn on to show them.' },
          { id: 'blockAnalytics', zh: '阻止界面埋点上报', en: 'Block UI analytics', status: 'ready', defaultOn: true,
            zhDesc: '界面点击等埋点事件不再发送，默认开启。宿主后端的采集策略不受此开关影响。',
            enDesc: 'Stops UI click analytics from being sent; on by default. The host backend collection policy is not affected.' },
          { id: 'foldErrors', zh: '错误信息折叠为一行', en: 'Fold error details to one line', status: 'ready', defaultOn: true,
            zhDesc: '“本轮运行失败”的详情默认显示为一行，点击该行展开。',
            enDesc: 'Turn-failure details show on one line by default; click the row to expand.' },
          { id: 'fileReference', zh: '文件引用', en: 'File references', status: 'host',
            zhDesc: '在输入框键入 @ 检索工作区文件；宿主已内置该能力。',
            enDesc: 'Type @ in the composer to reference workspace files; provided by the host.' },
          { id: 'workbench', zh: '工作台', en: 'Workbench', status: 'host',
            zhDesc: '文件、终端与文档预览；宿主已提供对应侧栏。',
            enDesc: 'Files, terminal and document preview; the host already provides these panels.' },
          { id: 'visionBridge', zh: '视觉识别', en: 'Vision bridge', status: 'ready', defaultOn: false,
            zhDesc: '粘贴图片后，由你配置的视觉多模态模型识别为文字并插入输入框。默认关闭，需先在设置里配置。',
            enDesc: 'Paste an image; your configured vision model turns it into text in the composer. Off by default; configure it in settings first.' },
          { id: 'webSearch', zh: '联网搜索', en: 'Web search', status: 'ready', defaultOn: true,
            zhDesc: '输入 /search 加关键词手动搜索，结果会填入输入框供确认。搜索可使用独立服务商或宿主服务；模型 API Key 不等于 DeepSeek 官方搜索密钥。',
            enDesc: 'Use /search plus keywords for manual results in the composer. Configure an independent provider or a Host web provider. A model key is not a DeepSeek official search credential.' },
        ];
        const STATUS_TAG: Record<string, string> = { host: '宿主已提供', hostService: '需宿主服务', planned: '规划中' };
        const STATUS_TAG_EN: Record<string, string> = { host: 'Built in', hostService: 'Needs host service', planned: 'Planned' };
        // #28 bilingual text: the document language is the single source, so a
        // locale switch is honoured without adding a service dependency.
        const isZh = () => {
          try {
            const lang = document.documentElement.lang || navigator.language || 'zh';
            return /^zh/i.test(lang);
          } catch { return true; }
        };
        const pick = (zh: string, en: string) => (isZh() ? zh : (en || zh));
        const FLAGS_KEY = 'dsh-ui-delta.modules';
        const readFlags = () => {
          try { return JSON.parse(localStorage.getItem(FLAGS_KEY) || '{}') || {}; }
          catch { return {}; }
        };
        const writeFlag = (id: string, isOn: boolean) => {
          const next = { ...readFlags(), [id]: isOn };
          try { localStorage.setItem(FLAGS_KEY, JSON.stringify(next)); } catch { /* private mode */ }
          window.dispatchEvent(new Event('dsh-ui-delta:flags-changed'));
        };
        // v0.1.0: vision and search run in the host half (index.js). The browser keeps no
        // API key: settings are read from and written to the host, which stores the key encrypted.

        // v0.1.0: model names to hide from the model picker (display only; they stay callable)
        const HIDDEN_MODELS_KEY = 'dsh-ui-delta.hiddenModels';
        const readHidden = () => {
          try { return localStorage.getItem(HIDDEN_MODELS_KEY) || ''; } catch { return ''; }
        };
        const writeHidden = (text: string) => {
          try { localStorage.setItem(HIDDEN_MODELS_KEY, text); } catch { /* private mode */ }
        };
        const moduleById = (id: string) => MODULES.find((m) => m.id === id);
        const moduleOn = (id: string) => {
          const stored = readFlags()[id];
          if (stored !== undefined) return stored === true;
          const m = moduleById(id);
          return !!(m && m.defaultOn);
        };
        // Exposed so feature code can gate itself on the user's switches.
        window.__deltaModules = { list: MODULES, enabled: moduleOn };

        try {
          const React = require('react');
          const h = React.createElement;
          function DeltaSettings() {
            const [flags, setFlags] = React.useState(readFlags);
            const isReady = (m: ModuleDef) => m.status === 'ready';
            const toggle = (m: ModuleDef) => {
              if (!isReady(m)) return;
              const next = !flags[m.id];
              writeFlag(m.id, next);
              setFlags({ ...flags, [m.id]: next });
            };
            const row = (m: ModuleDef) => h('label', {
              key: m.id,
              className: 'ens-set-row' + (isReady(m) ? '' : ' ens-set-row-planned'),
            }, [
              h('span', { key: 't', className: 'ens-set-text' }, [
                h('span', { key: 'n', className: 'ens-set-name' }, pick(m.zh, m.en)),
                h('span', { key: 'e', className: 'ens-set-en' }, pick(m.en, m.zh)),
                h('span', { key: 'd', className: 'ens-set-desc' }, pick(m.zhDesc, m.enDesc)),
              ]),
              h('span', { key: 's', className: 'ens-set-side' }, [
                STATUS_TAG[m.status]
                  ? h('span', { key: 'p', className: 'ens-plan-tag' }, pick(STATUS_TAG[m.status], STATUS_TAG_EN[m.status]))
                  : null,
                h('button', {
                  key: 'b',
                  type: 'button',
                  role: 'switch',
                  'aria-checked': flags[m.id] === true,
                  'aria-label': m.zh,
                  disabled: !isReady(m),
                  className: 'ens-switch' + (flags[m.id] === true ? ' ens-switch-on' : ''),
                  onClick: () => toggle(m),
                }, h('span', { key: 'k', className: 'ens-switch-knob' })),
              ]),
            ]);
            // v0.1.0: names typed here are hidden from the model picker; calls are unaffected
            const [hiddenText, setHiddenText] = React.useState(readHidden);
            const hiddenRow = h('div', { key: 'hm', className: 'ens-set-row' }, [
              h('span', { key: 't', className: 'ens-set-text' }, [
                h('span', { key: 'n', className: 'ens-set-name' }, pick('在模型列表中隐藏', 'Hide in model list')),
                h('span', { key: 'd', className: 'ens-set-desc' }, pick(
                  '输入模型名称，用逗号分隔。只影响列表显示，模型仍可被调用。',
                  'Enter model names, comma-separated. Only the list changes; the models stay callable.',
                )),
              ]),
              h('input', {
                key: 'i',
                className: 'jrmgQW_input',
                value: hiddenText,
                placeholder: 'Omni',
                onChange: (ev: HarnessReactChangeEvent<HTMLInputElement>) => { setHiddenText(ev.target.value); writeHidden(ev.target.value); },
              }),
            ]);
            // v0.1.0: vision and search settings live in the host. The page loads a masked view
            // and sends a new key once; it never keeps the key.
            const [hostCfg, setHostCfg] = React.useState<HostConfig | null>(null);
            const [saveStatus, setSaveStatus] = React.useState<Record<string, string>>({});
            React.useEffect(() => {
              let isAlive = true;
              fetch('/dsh-ui-delta/config')
                .then((r) => r.json())
                .then((d) => { if (isAlive) setHostCfg(d); })
                .catch(() => { if (isAlive) setHostCfg({ error: true }); });
              return () => { isAlive = false; };
            }, []);
            const saveHost = async (section: string, fields: Record<string, unknown>) => {
              const r = await fetch('/dsh-ui-delta/config', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ section, ...fields }),
              });
              const d = await r.json();
              if (!r.ok || d.error) throw new Error(d.error || 'HTTP ' + r.status);
              setHostCfg(d);
              return d;
            };
            /**
             * v0.2.2 — one provider list per feature, several providers at a time.
             *
             * Each entry is { id, label, baseUrl/model/endpoint, keyHint, active }.
             * The host stores the array and encrypts every key; the browser only ever
             * sees the masked hint. The first entry (or the one marked active) is the
             * provider the feature actually uses, so a second configuration is a
             * ready spare rather than a silent duplicate.
             */
            interface ProviderDef {
              id?: string;
              label?: string;
              baseUrl?: string;
              endpoint?: string;
              model?: string;
              keyHint?: string;
              active?: boolean;
            }
            interface HostConfig {
              error?: boolean;
              [section: string]: { providers?: ProviderDef[] } | boolean | undefined;
            }
            const providerList = (section: string): ProviderDef[] => {
              const cfg = hostCfg ? hostCfg[section] : undefined;
              const providers = cfg && typeof cfg === 'object' ? cfg.providers : undefined;
              return Array.isArray(providers) ? providers : [];
            };
            const fieldLabel = (text: string) => h('div', { key: 'l', className: 'ens-set-name' }, text);
            const providerCard = (section: string, p: ProviderDef, index: number) => {
              const isVision = section === 'vision';
              const named = (p.label || '').trim() !== '';
              return h('div', { key: p.id || index, className: 'ens-provider' }, [
                h('div', { key: 'hd', className: 'ens-provider-head' }, [
                  h('input', {
                    key: 'nm', className: 'jrmgQW_input ens-provider-name', type: 'text',
                    placeholder: pick('服务商名称（如 硅基流动）', 'Provider name (e.g. SiliconFlow)'),
                    defaultValue: p.label || '',
                    'data-provider-field': 'label',
                  }),
                  h('button', {
                    key: 'del', type: 'button', className: 'ens-pill-btn',
                    onClick: () => { saveHost(section, { removeProvider: p.id }).catch((error) => setSaveStatus(prev => ({ ...prev, [p.id || '']: String(error) }))); },
                  }, pick('删除', 'Remove')),
                ]),
                fieldLabel(isVision ? pick('接口地址（OpenAI 兼容）', 'API base URL (OpenAI-compatible)') : pick('搜索接口地址', 'Search endpoint')),
                h('input', {
                  key: 'url', className: 'jrmgQW_input', type: 'text',
                  placeholder: isVision ? 'https://api.example.com/v1' : 'https://api.tavily.com/search',
                  defaultValue: (isVision ? p.baseUrl : p.endpoint) || '',
                  'data-provider-field': isVision ? 'baseUrl' : 'endpoint',
                }),
                isVision ? fieldLabel(pick('视觉模型', 'Vision model')) : null,
                isVision ? h('input', {
                  key: 'model', className: 'jrmgQW_input', type: 'text', placeholder: 'gpt-4o-mini',
                  defaultValue: p.model || '',
                  'data-provider-field': 'model',
                }) : null,
                fieldLabel(pick('API 密钥', 'API key')),
                h('input', {
                  key: 'key', className: 'jrmgQW_input', type: 'password',
                  placeholder: p.keyHint ? pick(`已保存 ${p.keyHint}，输入新值可替换`, `Saved ${p.keyHint}; type to replace`) : '',
                  'data-provider-field': 'apiKey',
                }),
                h('div', { key: 'saveRow' }, [
                  h('button', {
                    key: 'save', type: 'button', className: 'ens-pill-btn',
                    onClick: async (ev: { currentTarget: HTMLElement }) => {
                      const card = ev.currentTarget.closest('.ens-provider');
                      if (!card) return;
                      const fields: Record<string, string> = {};
                      card.querySelectorAll<HTMLInputElement>('input[data-provider-field]').forEach(input => {
                        if (input.dataset.providerField && (input.dataset.providerField !== 'apiKey' || input.value.trim()))
                          fields[input.dataset.providerField] = input.value;
                      });
                      setSaveStatus(prev => ({ ...prev, [p.id || '']: pick('保存中…', 'Saving…') }));
                      try {
                        await saveHost(section, { provider: { id: p.id, ...fields } });
                        const keyInput = card.querySelector<HTMLInputElement>('input[data-provider-field="apiKey"]');
                        if (keyInput) keyInput.value = '';
                        setSaveStatus(prev => ({ ...prev, [p.id || '']: pick('已保存', 'Saved') }));
                      } catch (error) {
                        setSaveStatus(prev => ({ ...prev, [p.id || '']: pick('保存失败：', 'Save failed: ') + String(error) }));
                      }
                    },
                  }, pick('保存配置', 'Save settings')),
                  h('span', { key: 'status', role: 'status', className: 'ens-set-desc' }, saveStatus[p.id || ''] || ''),
                ]),
                p.active ? h('div', { key: 'act', className: 'ens-set-name' }, pick('当前使用', 'In use')) : null,
              ]);
            };
            const featureBlock = (section: string, title: string, desc: string) => {
              const list = providerList(section);
              return h('div', { key: section, className: 'ens-privacy' }, [
                h('div', { key: 't', className: 'ens-privacy-title' }, title),
                h('div', { key: 'd', className: 'ens-privacy-body' }, desc),
                list.length
                  ? h('div', { key: 'list', className: 'ens-provider-list' }, list.map((p, i) => providerCard(section, p, i)))
                  : h('div', { key: 'empty', className: 'ens-privacy-body' }, pick('尚未配置服务商。', 'No provider configured yet.')),
                h('button', {
                  key: 'add', type: 'button', className: 'ens-pill-btn',
                  onClick: () => { saveHost(section, { addProvider: true }).catch((error) => setSaveStatus(prev => ({ ...prev, [section]: String(error) }))); },
                }, pick('添加服务商', 'Add provider')),
              ]);
            };
            // v0.2.2: a feature's settings appear only while its switch is on — an
            // off feature shows no fields to fill in, so the page never asks for
            // configuration that nothing reads.
            const visionOn = moduleOn('visionBridge');
            const searchOn = moduleOn('webSearch');
            const visionRow = visionOn ? featureBlock('vision',
              pick('视觉识别配置', 'Vision bridge settings'),
              pick(
                '粘贴的图片由宿主发送到下面配置的视觉多模态模型，识别出的文字插入输入框。可同时配置多个服务商，列表中的第一个生效；密钥由宿主加密保存，这里只显示末四位。',
                'The host sends a pasted image to the vision providers below and puts the recognised text into the composer. Several providers can be configured at once; the first one is used. Keys are stored encrypted by the host and only their last four characters are shown here.',
              )) : null;
            const searchRow = searchOn ? featureBlock('search',
              pick('联网搜索配置', 'Web search settings'),
              pick(
                '输入 /search 加关键词，可手动搜索并把结果填入输入框，不自动发送。可配置 Tavily 兼容接口；未配置时尝试宿主原生搜索。宿主默认 DeepSeek 官方搜索需要官方密钥，与你的自定义模型 API Key 独立。',
                'Type /search plus keywords to fill the composer with results; nothing is sent automatically. Configure a Tavily-compatible endpoint or use the Host web service. The Host default DeepSeek search requires a separate official key.',
              )) : null;
            const exportRow = h('div', { key: 'exp', className: 'ens-set-row' }, [
              h('span', { key: 't', className: 'ens-set-text' }, [
                h('span', { key: 'n', className: 'ens-set-name' }, pick('导出当前对话', 'Export this conversation')),
                h('span', { key: 'd', className: 'ens-set-desc' }, pick(
                  '下载为 Markdown 文件，全程在本机完成。',
                  'Downloads a Markdown file; everything happens on this machine.',
                )),
              ]),
              h('button', {
                key: 'b', type: 'button', className: 'ens-pill-btn',
                onClick: () => window.__deltaExportConversation?.(),
              }, pick('导出 .md', 'Export .md')),
            ]);
            return h('div', { className: 'ens-settings' }, [
              h('div', { key: 'h', className: 'ens-set-head' }, [
                h('div', { key: 't', className: 'ens-set-title' }, pick('Delta 配置', 'Delta settings')),
                h('div', { key: 'd', className: 'ens-set-sub' }, pick(
                  '外观与功能模块。仅「可用」的开关可操作，其余标注其真实状态。',
                  'Appearance and feature modules. Only available switches are operable; the rest state their real status.',
                )),
              ]),
              h('div', { key: 'l', className: 'ens-set-list' }, [...MODULES.map(row), hiddenRow]),
              visionRow,
              searchRow,
              exportRow,
              h('div', { key: 'p', className: 'ens-privacy' }, [
                h('div', { key: 't', className: 'ens-privacy-title' }, pick('隐私', 'Privacy')),
                h('div', { key: 'b', className: 'ens-privacy-body' }, pick(
                  '本插件不会主动上传会话日志；官方 DeepSeek 上传功能仍须在宿主配置中关闭。视觉识别和联网搜索会向你配置的服务发送相关内容。',
                  'This plugin excludes official DeepSeek session-log contributions, but the Host setting must also be disabled. Vision and web search send data to the services you configure.',
                )),
              ]),
            ]);
          }
          ctx.effect(() => ctx.slots.inject('settings.section', () => ctx.slots.register(
            { name: 'settings.section', id: '@fongap-labs/dsh-ui-delta', order: 20, label: t('Delta 配置', 'Delta settings') },
            DeltaSettings,
          )), 'dsh-ui-delta: settings module');
        } catch (error) {
          console.warn('[dsh-ui-delta] settings module unavailable:', error);
        }

        // NOTE: the shipped global-panel cells ('plugins', 'schedules') are NOT
        // re-registered here. Reusing a shipped cell id collides with the owning
        // package's own registration in this build: the owner fails to activate
        // and the web boot aborts. Navigation copy and icons therefore stay with
        // the owning packages; the refresh only restyles the rows they render.
      },
    };
  },
});
