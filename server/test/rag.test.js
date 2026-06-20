import { describe, expect, it } from 'vitest';
import { buildRagContext, extractKeywords } from '../src/services/rag.js';

describe('rag knowledge base', () => {
  it('strips question stopwords to focus retrieval keywords', () => {
    // 「怎么玩」「规则」是问法词，应被剥离，保留桌游名作为检索关键词
    const kw = extractKeywords('卡坦岛怎么玩，规则复杂吗？');
    expect(kw).toContain('卡坦岛');
    expect(kw).not.toContain('怎么');
  });

  it('falls back to the original sentence when only stopwords remain', () => {
    const kw = extractKeywords('怎么玩呢？');
    expect(kw.length).toBeGreaterThan(0);
  });

  it('builds numbered context blocks with citable sources', () => {
    const games = [
      { id: 1, title: '卡坦岛', category: '策略', description: '资源收集与交易。', minPlayers: 3, maxPlayers: 4, avgMinutes: 90, difficulty: 3, relevance: 5.2 },
      { id: 8, title: '瘟疫危机', category: '合作', description: '全员合作研制解药。', minPlayers: 2, maxPlayers: 4, avgMinutes: 60, difficulty: 3, relevance: 3.1 },
    ];
    const { context, sources } = buildRagContext(games);
    expect(context).toContain('[资料1] 卡坦岛');
    expect(context).toContain('[资料2] 瘟疫危机');
    expect(context).toContain('资源收集与交易');
    expect(sources).toHaveLength(2);
    expect(sources[0]).toMatchObject({ id: 1, title: '卡坦岛' });
  });

  it('returns empty context and sources when no games retrieved', () => {
    const { context, sources } = buildRagContext([]);
    expect(context).toBe('');
    expect(sources).toEqual([]);
  });
});
