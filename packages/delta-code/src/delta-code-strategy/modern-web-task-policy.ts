/** Conservative, task-scoped suggestion for the optional pinned web-platform guide tool. */
const WEB_TOPIC = /(?:\b(?:html|css|dom|browser|web\s?ui|frontend|front-end|dialog|modal|popover|responsive|accessibility|a11y|focus|keyboard\s+navigation|view\s+transition|container\s+quer(?:y|ies)|scroll\s+animation|web\s+component|inp|lcp|cls)\b|前端|网页|浏览器|弹窗|对话框|侧栏|响应式|无障碍|焦点管理|键盘导航|滚动动画|页面性能)/iu
const NON_WEB = /(?:\b(?:rust|backend|server|database|sql|ci\/cd|github\s+actions|docker|cargo|api\s+route|tsconfig|eslint)\b|后端|数据库|流水线|构建配置)/iu
const TRIVIAL = /(?:\b(?:rename|typo|copy\s+change|wording\s+only|text\s+only)\b|仅修改文案|只改文案|重命名|修正拼写)/iu
const EXPLICIT_OPTOUT = /(?:\b(?:no|without|avoid|skip|do\s+not|don't)\s+(?:external|remote|online|network|web\s+guidance|github\s+guidance)\b|不要联网|禁止联网|不使用外部|不要外部指南|禁用外部指南|跳过Web指南)/iu

/** A hint only: the model still checks project policy; never a hard runtime mandate. */
export function shouldSuggestModernWebGuidance(task: string): boolean {
  const text = task.normalize('NFKC').slice(-2048)
  if (!text.trim() || EXPLICIT_OPTOUT.test(text) || !WEB_TOPIC.test(text)) return false
  // No passive call on build/config tasks or trivial text/rename changes.
  if (TRIVIAL.test(text)) return false
  if (NON_WEB.test(text) && !/(?:\b(?:css|html|dom|frontend|browser|dialog|popover|responsive|accessibility)\b|前端|网页|浏览器|弹窗|侧栏)/iu.test(text)) return false
  return true
}
