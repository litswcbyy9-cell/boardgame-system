import { describe, expect, it } from 'vitest';
import {
  buildAgentActions,
  buildAgentFallbackAnswer,
  buildAgentToolResults,
  buildDashboardCards,
  buildGuideFallbackReply,
} from '../src/services/ai-agent.js';

const snapshot = {
  revenue: { todayYuan: 1280, settledSessions: 8 },
  tableState: { idle: 3, occupied: 5, reserved: 2 },
  memberStats: { activeMembers: 12, totalPoints: 3200 },
  rentalStats: { availableCopies: 9, overdueLoans: 2 },
  topGames: [{ title: '璀璨宝石' }],
  risks: [{ level: 'high', title: '租借逾期', count: 2, detail: '逾期未还' }],
};

describe('ai agent helpers', () => {
  it('builds dashboard cards from deterministic tool data', () => {
    const cards = buildDashboardCards(snapshot);
    expect(cards).toHaveLength(4);
    expect(cards[0]).toMatchObject({ id: 'revenue', value: '¥1280' });
    expect(cards[3]).toMatchObject({ id: 'rental', tone: 'rose' });
  });

  it('returns draft actions without write execution', () => {
    const actions = buildAgentActions(snapshot, 'dashboard');
    expect(actions.some((action) => action.page === 'rental')).toBe(true);
    expect(actions.every((action) => action.type !== 'execute')).toBe(true);
  });

  it('produces traceable tool results and fallback copy', () => {
    const tools = buildAgentToolResults(snapshot);
    const answer = buildAgentFallbackAnswer(snapshot);
    expect(tools.map((tool) => tool.tool)).toContain('risk_scan');
    expect(answer).toContain('AI 经营大脑');
  });

  it('guides customers without claiming reservation completion', () => {
    const reply = buildGuideFallbackReply({
      partySize: 4,
      recommendedGames: [{ title: '卡卡颂' }],
      availableTables: [{ code: 'A01' }],
    });
    expect(reply).toContain('不能替你直接提交预约');
    expect(reply).not.toContain('已帮你预约');
  });
});
