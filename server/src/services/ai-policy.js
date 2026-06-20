const WRITE_ACTION_CLAIM_RE = /(已|已经|我已|帮你|为你).{0,12}(预约|预订|占座|锁定|取消|结算|修改|删除|创建|提交)/;

export function containsUnsafeWriteClaim(text) {
  return WRITE_ACTION_CLAIM_RE.test(String(text || ''));
}

export function sanitizeAiReply(text, fallback = '我不能直接替你提交、取消或修改业务数据。请在页面中确认信息后点击对应按钮完成操作。') {
  const content = String(text || '').trim();
  if (!content) return fallback;
  if (containsUnsafeWriteClaim(content)) return fallback;
  return content;
}
