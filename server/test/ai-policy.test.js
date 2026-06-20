import { describe, expect, it } from 'vitest';
import { containsUnsafeWriteClaim, sanitizeAiReply } from '../src/services/ai-policy.js';

describe('ai policy', () => {
  it('detects unsafe claims about completed write actions', () => {
    expect(containsUnsafeWriteClaim('已经帮你预约好了')).toBe(true);
    expect(containsUnsafeWriteClaim('我可以推荐适合你的桌游')).toBe(false);
  });

  it('replaces unsafe write claims with a safe boundary message', () => {
    const safe = sanitizeAiReply('已经帮你取消预约');
    expect(safe).toContain('不能直接替你');
  });
});
