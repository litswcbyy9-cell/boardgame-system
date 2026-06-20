
import {
  buildAgentActions,
  buildAgentFallbackAnswer,
  buildAgentPrompt,
  buildAgentToolResults,
  buildDashboardCards,
  buildGuideFallbackReply,
  loadDashboardSnapshot,
  loadGuideContext,
  recordAiInteraction,
} from '../services/ai-agent.js';


export function registerAiRoutes(app, ctx) {
  const { pool, sendError, requireAuth, callLLM, llmInfo, sanitizeAiReply, runOperationalMaintenance } = ctx;

  app.get('/api/ai/info', requireAuth, (_req, res) => {  
    res.json(llmInfo());  
  });  
    
  // 桌游描述生成：输入桌游名+参数，生成中文简介  
  app.get('/api/ai/dashboard-snapshot', requireAuth, async (req, res) => {
    const snapshot = await loadDashboardSnapshot({
      pool,
      runOperationalMaintenance,
      days: req.query.days,
    });
    res.json({
      snapshot,
      cards: buildDashboardCards(snapshot),
      actions: buildAgentActions(snapshot, String(req.query.scope || 'dashboard')),
      toolResults: buildAgentToolResults(snapshot),
    });
  });

  app.post('/api/ai/agent', requireAuth, async (req, res) => {
    const message = String(req.body?.message || '').trim();
    const scope = ['dashboard', 'games', 'rental', 'members'].includes(req.body?.scope)
      ? req.body.scope
      : 'dashboard';
    if (!message) return sendError(res, 400, 'missing_fields');

    const startedAt = Date.now();
    const snapshot = await loadDashboardSnapshot({ pool, runOperationalMaintenance, days: req.body?.days });
    const cards = buildDashboardCards(snapshot);
    const actions = buildAgentActions(snapshot, scope);
    const toolResults = buildAgentToolResults(snapshot);
    let answer = buildAgentFallbackAnswer(snapshot);
    let mock = true;

    try {
      const result = await callLLM([
        { role: 'system', content: buildAgentPrompt(snapshot, scope) },
        { role: 'user', content: message },
      ], { temperature: 0.35, maxTokens: 1800 });
      answer = sanitizeAiReply(result.content || answer);
      mock = result.mock;
    } catch (error) {
      mock = true;
    }

    const durationMs = Date.now() - startedAt;
    await recordAiInteraction({
      pool,
      userType: 'staff',
      userId: req.user?.id || null,
      scope,
      message,
      tools: toolResults.map((item) => item.tool),
      mock,
      durationMs,
    });

    res.json({
      answer,
      cards,
      toolResults,
      actions,
      trace: {
        scope,
        tools: toolResults.map((item) => item.tool),
        durationMs,
        writeAllowed: false,
      },
      mock,
    });
  });

  app.post('/api/public/ai/guide', async (req, res) => {
    const message = String(req.body?.message || '').trim();
    if (!message) return sendError(res, 400, 'missing_fields');

    const startedAt = Date.now();
    const context = await loadGuideContext({
      pool,
      partySize: req.body?.partySize,
      startAt: req.body?.startAt,
      endAt: req.body?.endAt,
      preferences: req.body?.preferences || message,
    });
    let reply = buildGuideFallbackReply(context);
    let mock = true;

    try {
      const result = await callLLM([
        {
          role: 'system',
          content: `你是桌游馆顾客导购。你只能推荐桌游、解释空桌状态和说明预约流程，不能说已经帮用户预约、锁座、取消或修改任何数据。导购数据：${JSON.stringify(context)}`,
        },
        { role: 'user', content: message },
      ], { temperature: 0.45, maxTokens: 1200 });
      reply = sanitizeAiReply(result.content || reply);
      mock = result.mock;
    } catch (error) {
      mock = true;
    }

    await recordAiInteraction({
      pool,
      userType: 'customer',
      scope: 'guide',
      message,
      tools: ['game_recommendation', 'table_availability'],
      mock,
      durationMs: Date.now() - startedAt,
    });

    res.json({
      reply,
      recommendedGames: context.recommendedGames,
      availableTables: context.availableTables,
      nextStep: '请在页面左侧确认人数、到店时间、离店时间和桌位后，由你亲自点击提交预约。',
      mock,
    });
  });

  app.post('/api/ai/game-description', requireAuth, async (req, res) => {
    const { title, category, minPlayers, maxPlayers, avgMinutes, difficulty } = req.body || {};  
    if (!title) return sendError(res, 400, 'missing_fields');  
    const meta = [  
      category && `分类：${category}`,  
      (minPlayers || maxPlayers) && `人数：${minPlayers || '?'}-${maxPlayers || '?'} 人`,  
      avgMinutes && `时长：约 ${avgMinutes} 分钟`,  
      difficulty && `难度：${difficulty}/5`,  
    ].filter(Boolean).join('，');  
    try {  
      const { content, mock } = await callLLM([  
        { role: 'system', content: '你是桌游馆的资深店员，为桌游写简洁吸引人的中文介绍。控制在 80-120 字，包含玩法亮点和适合人群，不要分点，不要 markdown。' },  
        { role: 'user', content: `请为这款桌游写一段介绍：《${title}》${meta ? '（' + meta + '）' : ''}` },  
      ], { temperature: 0.8, maxTokens: 2000 });  
      res.json({ description: content.trim(), mock });  
    } catch (e) {  
      console.error('[ERROR] ai game-description:', e);  
      sendError(res, 502, 'llm_error', String(e.message));  
    }  
  });  
    
  // 经营数据问答：先查 DB 汇总，塞进 system prompt，LLM 自然语言回答  
  app.post('/api/ai/ask', requireAuth, async (req, res) => {  
    const question = String(req.body?.question || '').trim();  
    if (!question) return sendError(res, 400, 'missing_fields');
    try {
      const today = new Date().toISOString().slice(0, 10);
      const maintenance = await runOperationalMaintenance({ silent: true });
      const queryRows = async (sql, params = []) => {
        try {
          const [rows] = await pool.query(sql, params);
          return rows;
        } catch (error) {
          console.error('[WARN] ai context query failed:', error.message);
          return [];
        }
      };
      const queryOne = async (sql, params = []) => {
        const rows = await queryRows(sql, params);
        return rows[0] || {};
      };
      const [[revenue]] = await pool.query('CALL sp_report_daily_revenue(?)', [today]).then((r) => r[0]).catch(() => [[{}]]);
      const [popularity] = await pool.query('CALL sp_report_game_popularity(?)', [30]).then((r) => [r[0]]).catch(() => [[]]);
      const [tableUtil] = await pool.query('CALL sp_report_table_utilization(?)', [30]).then((r) => [r[0]]).catch(() => [[]]);
      const tableState = await queryOne(
        `SELECT SUM(status='idle') AS idle, SUM(status='reserved') AS reserved, SUM(status='occupied') AS occupied FROM game_table_state`
      );
      const memberStats = await queryOne(
        `SELECT COUNT(*) AS total,
                SUM(balance_cents) AS totalBalanceCents,
                SUM(points) AS totalPoints,
                SUM(total_spent_cents) AS totalSpentCents
         FROM players WHERE status='active'`
      );
      const staffStats = await queryOne(
        `SELECT COUNT(*) AS total,
                SUM(role='admin' AND status='active') AS managers,
                SUM(role='staff' AND status='active') AS staff,
                SUM(status='disabled') AS disabled
         FROM app_users`
      );
      const orderStats = await queryOne(
        `SELECT COUNT(*) AS todayOrders,
                SUM(final_cents) AS todayOrderRevenueCents,
                SUM(discount_cents) AS todayDiscountCents
         FROM orders
         WHERE status='paid' AND DATE(created_at)=CURDATE()`
      );
      const rentalStats = await queryOne(
        `SELECT
           (SELECT COUNT(*) FROM game_copies) AS totalCopies,
           (SELECT COUNT(*) FROM game_copies WHERE status='available') AS availableCopies,
           (SELECT COUNT(*) FROM game_loans WHERE status='active') AS activeLoans,
           (SELECT COUNT(*) FROM game_loans WHERE status='active' AND due_at < NOW()) AS overdueLoans`
      );
      const openSessions = await queryRows(
        `SELECT s.id, t.code AS tableCode, s.started_at AS startedAt, r.reserved_end AS reservedEnd,
                COALESCE(p.display_name, s.guest_name, r.guest_name, '现场客人') AS guestName,
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
        `SELECT display_name AS name, membershipLevel, points, total_spent_cents AS spentCents
         FROM players
         WHERE status='active'
         ORDER BY total_spent_cents DESC, points DESC
         LIMIT 8`
      );
      const games = await queryRows(
        `SELECT title, category, min_players AS minP, max_players AS maxP, avg_minutes AS mins, difficulty_level AS diff
         FROM games ORDER BY recommend_weight DESC LIMIT 40`
      );
  
      const context = {
        日期: today,
        自动维护: {
          未到店预约数: maintenance.expiredReservations,
          超时占用对局数: maintenance.overdueSessionCount,
          超时占用队列: maintenance.overdueSessions,
          即将结束对局: maintenance.dueSoonSessions,
          检查时间: maintenance.checkedAt,
        },
        今日收入元: revenue?.revenue_yuan ?? revenue?.total_revenue_yuan ?? 0,
        今日结算单数: revenue?.settled_sessions ?? 0,
        桌位状态: { 空闲: Number(tableState?.idle) || 0, 预约: Number(tableState?.reserved) || 0, 占用: Number(tableState?.occupied) || 0 },
        订单流水: {
          今日订单数: Number(orderStats.todayOrders) || 0,
          今日订单收入元: Number(orderStats.todayOrderRevenueCents || 0) / 100,
          今日优惠元: Number(orderStats.todayDiscountCents || 0) / 100,
        },
        会员概况: {
          活跃会员数: Number(memberStats?.total) || 0,
          储值余额元: Number(memberStats?.totalBalanceCents || 0) / 100,
          总积分: Number(memberStats?.totalPoints) || 0,
          累计消费元: Number(memberStats?.totalSpentCents || 0) / 100,
          高消费会员: topMembers.map((m) => ({ 姓名: m.name, 等级: m.membershipLevel, 积分: m.points, 累计消费元: Number(m.spentCents || 0) / 100 })),
        },
        员工权限: {
          总账号: Number(staffStats.total) || 0,
          店长: Number(staffStats.managers) || 0,
          员工: Number(staffStats.staff) || 0,
          停用: Number(staffStats.disabled) || 0,
        },
        租借服务: {
          总副本: Number(rentalStats.totalCopies) || 0,
          可借副本: Number(rentalStats.availableCopies) || 0,
          借出中: Number(rentalStats.activeLoans) || 0,
          逾期未还: Number(rentalStats.overdueLoans) || 0,
        },
        进行中对局: openSessions.map((s) => ({
          session: s.id,
          桌位: s.tableCode,
          客人: s.guestName,
          人数: s.partySize,
          已进行分钟: s.runningMinutes,
          预约结束: s.reservedEnd,
        })),
        待入场预约: upcomingReservations.map((r) => ({
          预约: r.id,
          桌位: r.tableCode,
          客人: r.guestName,
          人数: r.partySize,
          开始: r.reservedStart,
          结束: r.reservedEnd,
        })),
        热门桌游TOP5: (popularity || []).slice(0, 5).map((p) => ({ 名称: p.title || p.game_title, 局数: p.record_count ?? p.play_count })),
        热门桌位TOP5: (tableUtil || []).slice(0, 5).map((t) => ({ 桌位: t.code, 场次: t.settled_sessions_in_range ?? t.sessions })),
        桌游目录: games.map((g) => ({ 名称: g.title, 分类: g.category, 人数: `${g.minP}-${g.maxP}`, 时长分钟: g.mins, 难度: g.diff })),
      };
      const { content, mock } = await callLLM([
        { role: 'system', content: '你是桌游馆常驻运营助手。根据提供的 JSON 数据用简洁中文回答店员的问题。经营类问题只依据数据回答、不编造数字；你不能代替店员创建预约、结算、取消或修改任何数据，只能给出建议并引导店员到对应页面操作；如果发现即将结束、超时占用、租借逾期等风险，要主动点出来并给出下一步操作。桌游推荐类问题（按人数/时长/难度/分类/偏好）从「桌游目录」里挑选最合适的 2-4 款并说明推荐理由。' },
        { role: 'user', content: `数据：\n${JSON.stringify(context, null, 2)}\n\n问题：${question}` },
      ], { temperature: 0.4, maxTokens: 2500 });
      res.json({ answer: sanitizeAiReply(content), data: context, mock });
    } catch (e) {  
      console.error('[ERROR] ai ask:', e);  
      sendError(res, 502, 'llm_error', String(e.message));  
    }  
  });  
    
  function tableAreaText(areaType) {
    return {
      standard: '标准区',
      party: '聚会区',
      private: '包间',
      quiet: '安静区',
    }[areaType] || areaType || '标准区';
  }
  
  function publicTableAvailabilityReply(tables) {
    const idle = tables.filter((table) => table.status === 'idle');
    const reserved = tables.filter((table) => table.status === 'reserved').length;
    const occupied = tables.filter((table) => table.status === 'occupied').length;
    if (!idle.length) {
      return `当前没有空闲桌位。已有 ${reserved} 张预留桌、${occupied} 张占用桌。未来时段请在页面预约表单里选择人数和到离店时间后查询。`;
    }
    const list = idle
      .slice(0, 8)
      .map((table) => `${table.code}（${table.seatCapacity}人，${tableAreaText(table.areaType)}）`)
      .join('、');
    const more = idle.length > 8 ? `，另有 ${idle.length - 8} 张空桌` : '';
    return `当前空闲桌位有 ${idle.length} 张：${list}${more}。这只代表此刻状态；如果要预约未来时段，请在页面左侧填写人数、到店和离店时间，再点击“查找可用桌位”。`;
  }
  
  function isBookingActionIntent(message) {
    return /(帮|替|给我|麻烦|能不能).*(预约|预订|订桌|定桌|订位|定位|约桌)|(?:我要|我想|想要).*(预约|预订|订桌|定桌|订位|定位|约桌)|(预约|预订|订桌|定桌|订位|定张桌|约个桌).*(一下|吧|可以吗|吗)/.test(message);
  }
  
  function isCurrentAvailabilityIntent(message) {
    return /(现在|当前|目前|此刻|今天).*(空桌|空位|空闲|有桌|桌位|座位)|(空桌|空位|空闲桌|还有桌|有没有桌|有位置|有座位)/.test(message);
  }
  
  // 顾客 AI 客服（公开端点）：只答桌游/预约相关，附带桌游目录和当前桌位状态
  app.post('/api/public/ai/chat', async (req, res) => {
    const message = String(req.body?.message || '').trim();
    if (!message) return sendError(res, 400, 'missing_fields');
    try {
      const [games] = await pool.query(
        `SELECT title, category, min_players AS minP, max_players AS maxP, avg_minutes AS mins, difficulty_level AS diff
         FROM games ORDER BY recommend_weight DESC LIMIT 30`
      );
      const [tables] = await pool.query(
        `SELECT table_id AS tableId, code, seat_capacity AS seatCapacity, area_type AS areaType, status
         FROM v_table_status_floor
         ORDER BY status ASC, sort_order ASC, code ASC`
      );
      const availabilityReply = publicTableAvailabilityReply(tables);
  
      if (isBookingActionIntent(message)) {
        return res.json({
          reply: `我不能直接替你提交预约，也不会帮你占座。${availabilityReply} 填好后由系统提交预约，成功后会显示预约编号。`,
          mock: false,
          data: { tables },
        });
      }
  
      if (isCurrentAvailabilityIntent(message)) {
        return res.json({ reply: availabilityReply, mock: false, data: { tables } });
      }
  
      const catalog = games.map((g) => `${g.title}（${g.category}，${g.minP}-${g.maxP}人，${g.mins}分钟，难度${g.diff}/5）`).join('；');
      const tableSummary = {
        当前空桌: tables.filter((table) => table.status === 'idle').map((table) => ({ 桌号: table.code, 人数: table.seatCapacity, 区域: tableAreaText(table.areaType) })),
        已预留: tables.filter((table) => table.status === 'reserved').map((table) => table.code),
        占用中: tables.filter((table) => table.status === 'occupied').map((table) => table.code),
      };
      const { content, mock } = await callLLM([
        {
          role: 'system',
          content: `你是桌游馆的友好客服。只回答桌游推荐、预约流程、营业和当前桌位状态相关问题，其他话题礼貌婉拒。严格规则：1. 你没有权限替顾客创建、提交、修改、取消预约；2. 不得说“已帮你预约/已提交/已锁定/已保留桌位”；3. 顾客想预约时，引导其在页面左侧预约表单填写人数、到店时间、离店时间并点击查找/提交；4. 当前空桌只能依据“当前桌位状态”回答，未来时段可用性必须让顾客用预约表单查询；5. 不编造数据。店内桌游目录：${catalog}。当前桌位状态：${JSON.stringify(tableSummary)}。回答简洁热情，控制在 120 字内。`,
        },
        { role: 'user', content: message },
      ], { temperature: 0.3, maxTokens: 1600 });
      res.json({ reply: sanitizeAiReply(content), mock, data: { tables } });
    } catch (e) {
      console.error('[ERROR] ai chat:', e);
      sendError(res, 502, 'llm_error', String(e.message));
    }
  });
  
  // ---------- 租户信息 ----------
}
