/** Conservative, task-scoped suggestion for the optional pinned web-platform guide tool. */
const WEB_TOPIC = /(?:\b(?:html|css|dom|browser|web\s?ui|frontend|front-end|dialog|modal|popover|responsive|accessibility|a11y|focus|keyboard\s+navigation|view\s+transition|container\s+quer(?:y|ies)|scroll\s+animation|web\s+component|inp|lcp|cls)\b|\u524d\u7aef|\u7f51\u9875|\u6d4f\u89c8\u5668|\u5f39\u7a97|\u5bf9\u8bdd\u6846|\u4fa7\u680f|\u54cd\u5e94\u5f0f|\u65e0\u969c\u788d|\u7126\u70b9\u7ba1\u7406|\u952e\u76d8\u5bfc\u822a|\u6eda\u52a8\u52a8\u753b|\u9875\u9762\u6027\u80fd)/iu
const NON_WEB = /(?:\b(?:rust|backend|server|database|sql|ci\/cd|github\s+actions|docker|cargo|api\s+route|tsconfig|eslint)\b|\u540e\u7aef|\u6570\u636e\u5e93|\u6d41\u6c34\u7ebf|\u6784\u5efa\u914d\u7f6e)/iu
const TRIVIAL = /(?:\b(?:rename|typo|copy\s+change|wording\s+only|text\s+only)\b|\u4ec5\u4fee\u6539\u6587\u6848|\u53ea\u6539\u6587\u6848|\u91cd\u547d\u540d|\u4fee\u6b63\u62fc\u5199)/iu
const EXPLICIT_OPTOUT = /(?:\b(?:no|without|avoid|skip|do\s+not|don't)\s+(?:external|remote|online|network|web\s+guidance|github\s+guidance)\b|\u4e0d\u8981\u8054\u7f51|\u7981\u6b62\u8054\u7f51|\u4e0d\u4f7f\u7528\u5916\u90e8|\u4e0d\u8981\u5916\u90e8\u6307\u5357|\u7981\u7528\u5916\u90e8\u6307\u5357|\u8df3\u8fc7Web\u6307\u5357)/iu

/** A hint only: the model still checks project policy; never a hard runtime mandate. */
export function shouldSuggestModernWebGuidance(task: string): boolean {
  const text = task.normalize('NFKC').slice(-2048)
  if (!text.trim() || EXPLICIT_OPTOUT.test(text) || !WEB_TOPIC.test(text)) return false
  // No passive call on build/config tasks or trivial text/rename changes.
  if (TRIVIAL.test(text)) return false
  if (NON_WEB.test(text) && !/(?:\b(?:css|html|dom|frontend|browser|dialog|popover|responsive|accessibility)\b|\u524d\u7aef|\u7f51\u9875|\u6d4f\u89c8\u5668|\u5f39\u7a97|\u4fa7\u680f)/iu.test(text)) return false
  return true
}
