const DEFAULT_DAYS = 30;
const MAX_DAYS = 365;

function clampDays(value) {
  const n = Number(value || DEFAULT_DAYS);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_DAYS;
  return Math.min(MAX_DAYS, Math.round(n));
}

function num(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

async function queryRows(pool, sql, params = []) {
  try {
    const [rows] = await pool.query(sql, params);
    return rows;
  } catch (error) {
    return [];
  }
}

async function queryOne(pool, sql, params = []) {
  const rows = await queryRows(pool, sql, params);
  return rows[0] || {};
}

async function callProcedureRows(pool, sql, params = []) {
  try {
    const [sets] = await pool.query(sql, params);
    return sets[0] || [];
  } catch (error) {
    return [];
  }
}

function buildRisks({ maintenance, rentalStats, tableState }) {
  const risks = [];
  const overdueSessions = Array.isArray(maintenance?.overdueSessions) ? maintenance.overdueSessions : [];
  const dueSoonSessions = Array.isArray(maintenance?.dueSoonSessions) ? maintenance.dueSoonSessions : [];
  const expiredReservations = num(maintenance?.expiredReservations);
  const overdueLoans = num(rentalStats?.overdueLoans);

  if (overdueSessions.length) {
    risks.push({
      level: 'high',
      title: '超时占用',
      count: overdueSessions.length,
      detail: '有桌位已超过预约结束时间，建议店员主动确认是否续时或结算。',
    });
  }
  if (dueSoonSessions.length) {
    risks.push({
      level: 'medium',
      title: '即将到时',
      count: dueSoonSessions.length,
      detail: '有对局接近结束时间，可提前提醒顾客或准备下一场预约。',
    });
  }
  if (expiredReservations) {
    risks.push({
      level: 'medium',
      title: '未到店预约',
      count: expiredReservations,
      detail: '存在超过宽限时间的待入场预约，建议电话确认或释放桌位。',
    });
  }
  if (overdueLoans) {
    risks.push({
      level: 'high',
      title: '租借逾期',
      count: overdueLoans,
      detail: '有桌游副本超过应还时间，建议联系借出人。',
    });
  }
  if (num(tableState?.idle) === 0) {
    risks.push({
      level: 'info',
      title: '当前满座',
      count: 0,
      detail: '当前没有空闲桌位，顾客预约应优先推荐后续时段。',
    });
  }
  return risks;
}

export async function loadDashboardSnapshot({ pool, runOperationalMaintenance, days = DEFAULT_DAYS } = {}) {
  const checkedDays = clampDays(days);
  const today = new Date().toISOString().slice(0, 10);
  const maintenance = runOperationalMaintenance
    ? await runOperationalMaintenance({ silent: true }).catch((error) => ({ error: error.message }))
    : {};

  const revenueRows = await callProcedureRows(pool, 'CALL sp_report_daily_revenue(?)', [today]);
  const popularity = await callProcedureRows(pool, 'CALL sp_report_game_popularity(?)', [checkedDays]);
  const tableUtilization = await callProcedureRows(pool, 'CALL sp_report_table_utilization(?)', [checkedDays]);
  const revenue = revenueRows[0] || {};
  const tableState = await queryOne(
    pool,
    `SELECT
       SUM(status='idle') AS idle,
       SUM(status='reserved') AS reserved,
       SUM(status='occupied') AS occupied
     FROM game_table_state`
  );
  const memberStats = await queryOne(
    pool,
    `SELECT COUNT(*) AS total,
            SUM(balance_cents) AS totalBalanceCents,
            SUM(points) AS totalPoints,
            SUM(total_spent_cents) AS totalSpentCents
     FROM players
     WHERE status='active'`
  );
  const orderStats = await queryOne(
    pool,
    `SELECT COUNT(*) AS todayOrders,
            SUM(final_cents) AS todayOrderRevenueCents,
            SUM(discount_cents) AS todayDiscountCents
     FROM orders
     WHERE status='paid' AND DATE(created_at)=CURDATE()`
  );
  const rentalStats = await queryOne(
    pool,
    `SELECT
       (SELECT COUNT(*) FROM game_copies) AS totalCopies,
       (SELECT COUNT(*) FROM game_copies WHERE status='available') AS availableCopies,
       (SELECT COUNT(*) FROM game_loans WHERE status='active') AS activeLoans,
       (SELECT COUNT(*) FROM game_loans WHERE status='active' AND due_at < NOW()) AS overdueLoans`
  );
  const openSessions = await queryRows(
    pool,
    `SELECT s.id, t.code AS tableCode, s.started_at AS startedAt, r.reserved_end AS reservedEnd,
            COALESCE(p.display_name, s.guest_name, r.guest_name, '现场顾客') AS guestName,
            s.party_size AS partySize,
            TIMESTAMPDIFF(MINUTE, s.started_at, NOW()) AS runningMinutes
     FROM play_sessions s
     INNER JOIN game_tables t ON t.id=s.table_id
     LEFT JOIN reservations r ON r.id=s.reservation_id
     LEFT JOIN players p ON p.id=r.player_id
     WHERE s.ended_at IS NULL
     ORDER BY s.started_at ASC
     LIMIT 12`
  );
  const upcomingReservations = await queryRows(
    pool,
    `SELECT r.id, t.code AS tableCode, COALESCE(p.display_name, r.guest_name, '访客') AS guestName,
            r.party_size AS partySize, r.reserved_start AS reservedStart, r.reserved_end AS reservedEnd
     FROM reservations r
     INNER JOIN game_tables t ON t.id=r.table_id
     LEFT JOIN players p ON p.id=r.player_id
     WHERE r.status='pending'
     ORDER BY r.reserved_start ASC
     LIMIT 12`
  );
  const topMembers = await queryRows(
    pool,
    `SELECT display_name AS name, membershipLevel, points, total_spent_cents AS spentCents
     FROM players
     WHERE status='active'
     ORDER BY total_spent_cents DESC, points DESC
     LIMIT 8`
  );
  const topGames = (popularity || []).slice(0, 8).map((row) => ({
    title: row.title || row.game_title,
    category: row.category || '',
    playCount: num(row.record_count ?? row.play_count),
  }));
  const topTables = (tableUtilization || []).slice(0, 8).map((row) => ({
    code: row.code,
    sessions: num(row.settled_sessions_in_range ?? row.sessions),
  }));

  const snapshot = {
    checkedAt: new Date().toISOString(),
    days: checkedDays,
    today,
    revenue: {
      todayYuan: num(revenue?.revenue_yuan ?? revenue?.total_revenue_yuan),
      settledSessions: num(revenue?.settled_sessions),
      todayOrders: num(orderStats?.todayOrders),
      todayOrderRevenueYuan: num(orderStats?.todayOrderRevenueCents) / 100,
      todayDiscountYuan: num(orderStats?.todayDiscountCents) / 100,
    },
    tableState: {
      idle: num(tableState?.idle),
      reserved: num(tableState?.reserved),
      occupied: num(tableState?.occupied),
    },
    memberStats: {
      activeMembers: num(memberStats?.total),
      totalBalanceYuan: num(memberStats?.totalBalanceCents) / 100,
      totalPoints: num(memberStats?.totalPoints),
      totalSpentYuan: num(memberStats?.totalSpentCents) / 100,
      topMembers: topMembers.map((member) => ({
        name: member.name,
        level: member.membershipLevel,
        points: num(member.points),
        spentYuan: num(member.spentCents) / 100,
      })),
    },
    rentalStats: {
      totalCopies: num(rentalStats?.totalCopies),
      availableCopies: num(rentalStats?.availableCopies),
      activeLoans: num(rentalStats?.activeLoans),
      overdueLoans: num(rentalStats?.overdueLoans),
    },
    maintenance,
    openSessions,
    upcomingReservations,
    topGames,
    topTables,
  };
  snapshot.risks = buildRisks(snapshot);
  return snapshot;
}

export function buildDashboardCards(snapshot) {
  return [
    {
      id: 'revenue',
      label: '今日收入',
      value: `¥${Math.round(num(snapshot?.revenue?.todayYuan))}`,
      tone: 'cyan',
      detail: `${num(snapshot?.revenue?.settledSessions)} 场已结算`,
    },
    {
      id: 'tables',
      label: '空闲桌位',
      value: String(num(snapshot?.tableState?.idle)),
      tone: num(snapshot?.tableState?.idle) > 0 ? 'green' : 'amber',
      detail: `${num(snapshot?.tableState?.occupied)} 张占用 · ${num(snapshot?.tableState?.reserved)} 张预留`,
    },
    {
      id: 'members',
      label: '活跃会员',
      value: String(num(snapshot?.memberStats?.activeMembers)),
      tone: 'violet',
      detail: `积分池 ${num(snapshot?.memberStats?.totalPoints)} 分`,
    },
    {
      id: 'rental',
      label: '租借逾期',
      value: String(num(snapshot?.rentalStats?.overdueLoans)),
      tone: num(snapshot?.rentalStats?.overdueLoans) > 0 ? 'rose' : 'green',
      detail: `${num(snapshot?.rentalStats?.availableCopies)} 套可借`,
    },
  ];
}

export function buildAgentActions(snapshot, scope = 'dashboard') {
  const actions = [];
  if (num(snapshot?.rentalStats?.overdueLoans) > 0) {
    actions.push({ type: 'navigate', label: '查看逾期租借', page: 'rental', filter: 'overdue', severity: 'high' });
  }
  if ((snapshot?.risks || []).some((risk) => risk.title === '超时占用')) {
    actions.push({ type: 'navigate', label: '处理超时桌位', page: 'sessions', filter: 'overdue', severity: 'high' });
  }
  if (num(snapshot?.tableState?.idle) > 0) {
    actions.push({ type: 'suggestion', label: '引导顾客预约当前空桌', page: 'tables', severity: 'medium' });
  }
  if (scope === 'games' || (snapshot?.topGames || []).length < 3) {
    actions.push({ type: 'suggestion', label: '补充桌游封面与描述，提升导购效果', page: 'games', severity: 'medium' });
  }
  if (!actions.length) {
    actions.push({ type: 'suggestion', label: '当前风险较低，可以重点推荐热门桌游和会员活动', page: 'dashboard', severity: 'info' });
  }
  return actions.slice(0, 5);
}

export function buildAgentToolResults(snapshot) {
  return [
    { tool: 'daily_revenue', ok: true, summary: `今日收入 ¥${Math.round(num(snapshot?.revenue?.todayYuan))}` },
    { tool: 'table_state', ok: true, summary: `空闲 ${num(snapshot?.tableState?.idle)} / 占用 ${num(snapshot?.tableState?.occupied)} / 预留 ${num(snapshot?.tableState?.reserved)}` },
    { tool: 'risk_scan', ok: true, summary: `${(snapshot?.risks || []).length} 个经营提醒` },
    { tool: 'rental_scan', ok: true, summary: `${num(snapshot?.rentalStats?.overdueLoans)} 个逾期租借` },
  ];
}

export function buildAgentFallbackAnswer(snapshot) {
  const risks = snapshot?.risks || [];
  const topGame = snapshot?.topGames?.[0]?.title || '热门桌游';
  if (risks.length) {
    return `AI 经营大脑已完成巡检：当前最需要关注「${risks[0].title}」，共有 ${risks[0].count} 项。今日收入约 ¥${Math.round(num(snapshot?.revenue?.todayYuan))}，空闲桌位 ${num(snapshot?.tableState?.idle)} 张。建议先处理高风险事项，再引导顾客预约并推荐 ${topGame}。`;
  }
  return `AI 经营大脑已完成巡检：当前风险较低，今日收入约 ¥${Math.round(num(snapshot?.revenue?.todayYuan))}，空闲桌位 ${num(snapshot?.tableState?.idle)} 张。可以主推 ${topGame}，同时关注会员活跃和租借转化。`;
}

export function buildAgentPrompt(snapshot, scope = 'dashboard') {
  return `你是桌游馆 AI 经营大脑。只允许基于工具数据分析和建议，不允许声称已经预约、取消、结算、修改账号或删除数据。当前范围：${scope}。经营快照 JSON：${JSON.stringify(snapshot)}`;
}

export async function loadGuideContext({ pool, partySize, startAt, endAt, preferences } = {}) {
  const size = Math.min(20, Math.max(1, Math.round(num(partySize) || 4)));
  const pref = String(preferences || '').trim();
  const [games, tables] = await Promise.all([
    queryRows(
      pool,
      `SELECT id, title, category, min_players AS minPlayers, max_players AS maxPlayers,
              avg_minutes AS avgMinutes, difficulty_level AS difficultyLevel, cover_image_url AS coverImageUrl,
              total_play_records AS totalPlayRecords, recent_30_records AS recent30Records
       FROM games
       WHERE min_players <= ? AND max_players >= ?
       ORDER BY recommend_weight DESC, recent_30_records DESC, total_play_records DESC, title ASC
       LIMIT 8`,
      [size, size]
    ),
    queryRows(
      pool,
      `SELECT table_id AS tableId, code, seat_capacity AS seatCapacity, area_type AS areaType, status
       FROM v_table_status_floor
       ORDER BY status ASC, sort_order ASC, code ASC
       LIMIT 20`
    ),
  ]);
  const idleTables = tables.filter((table) => table.status === 'idle' && num(table.seatCapacity) >= size);
  const recommendedGames = games.map((game) => ({
    ...game,
    reason: `${size} 人可玩，${game.category || '综合'}类型，约 ${game.avgMinutes || 90} 分钟${pref ? `，可结合「${pref}」偏好选择` : ''}`,
  }));
  return {
    partySize: size,
    startAt: startAt || null,
    endAt: endAt || null,
    preferences: pref,
    recommendedGames,
    availableTables: idleTables.slice(0, 8),
  };
}

export function buildGuideFallbackReply(context) {
  const games = context?.recommendedGames || [];
  const tables = context?.availableTables || [];
  const gameText = games.length ? games.slice(0, 3).map((game) => game.title).join('、') : '当前目录里的入门桌游';
  const tableText = tables.length ? `当前适合人数的空桌有 ${tables.map((table) => table.code).slice(0, 4).join('、')}` : '当前没有直接匹配的空桌，建议调整时段或人数后查询';
  return `我先按 ${context.partySize} 人帮你做了导购：推荐 ${gameText}。${tableText}。我不能替你直接提交预约，请在页面左侧确认时间和桌位后点击提交。`;
}

export async function recordAiInteraction({ pool, userType = 'staff', userId = null, scope = null, message = '', tools = [], mock = false, durationMs = null } = {}) {
  if (!pool) return;
  try {
    await pool.query(
      `INSERT INTO ai_interactions (user_type, user_id, scope, message_preview, tools_json, mock, duration_ms)
       VALUES (?, ?, ?, ?, CAST(? AS JSON), ?, ?)`,
      [
        userType,
        userId,
        scope,
        String(message || '').slice(0, 300),
        JSON.stringify(tools),
        mock ? 1 : 0,
        durationMs == null ? null : Math.max(0, Math.round(Number(durationMs) || 0)),
      ]
    );
  } catch (error) {
    // Optional audit table: deployments that have not run the latest migration should not break AI.
  }
}
