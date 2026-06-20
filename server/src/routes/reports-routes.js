import { buildGameReason, buildTableReason, parseDateInput, toMysqlDatetime, toPositiveInt } from './route-utils.js';

export function registerReportsRoutes(app, ctx) {
  const { pool, sendError } = ctx;

  app.get('/api/recommendations/games', async (req, res) => {  
    const playerId = req.query.playerId ? Number(req.query.playerId) : null;  
    const partySize = toPositiveInt(req.query.partySize, 4, 20);  
    const minutes = toPositiveInt(req.query.minutes, 120, 600);  
    const category = String(req.query.category || '').trim();  
    
    if (req.query.playerId && (!Number.isFinite(playerId) || playerId <= 0)) {  
      return sendError(res, 400, 'invalid_player_id');  
    }  
    
    const [sets] = await pool.query('CALL sp_recommend_games(?, ?, ?, ?)', [playerId, partySize, minutes, category]);  
    const rows = sets[0] || [];  
    res.json(  
      rows.map((row) => ({  
        gameId: row.game_id,  
        title: row.title,  
        coverImageUrl: row.cover_image_url,  
        minPlayers: row.min_players,  
        maxPlayers: row.max_players,  
        category: row.category,  
        difficultyLevel: row.difficulty_level,  
        avgMinutes: row.avg_minutes,  
        totalPlayRecords: row.total_play_records,  
        recent30Records: row.recent_30_records,  
        score: Number(row.score),  
        scores: {  
          people: Number(row.people_score),  
          duration: Number(row.duration_score),  
          category: Number(row.category_score),  
          history: Number(row.history_score),  
          hot: Number(row.hot_score),  
          weight: Number(row.weight_score),  
        },  
        reason: buildGameReason(row, { partySize, minutes, category }),  
      }))  
    );  
  });  
    
  app.get('/api/recommendations/tables', async (req, res) => {  
    const partySize = toPositiveInt(req.query.partySize, 4, 20);  
    const now = new Date();  
    const startDate = parseDateInput(req.query.startAt, now);  
    const endDate = parseDateInput(req.query.endAt, new Date(startDate ? startDate.getTime() + 2 * 3600000 : now.getTime() + 2 * 3600000));  
    
    if (!startDate || !endDate) {  
      return sendError(res, 400, 'invalid_time');  
    }  
    if (startDate >= endDate) {  
      return sendError(res, 400, 'invalid_time_range');  
    }  
    
    const [sets] = await pool.query('CALL sp_recommend_tables(?, ?, ?)', [  
      partySize,  
      toMysqlDatetime(startDate),  
      toMysqlDatetime(endDate),  
    ]);  
    const rows = sets[0] || [];  
    res.json(  
      rows.map((row) => ({  
        tableId: row.table_id,  
        code: row.code,  
        seatCapacity: row.seat_capacity,  
        areaType: row.area_type,  
        posX: row.pos_x,  
        posY: row.pos_y,  
        status: row.status,  
        recentSessions: row.recent_sessions,  
        score: Number(row.score),  
        scores: {  
          capacity: Number(row.capacity_score),  
          availability: Number(row.availability_score),  
          utilization: Number(row.utilization_score),  
        },  
        reason: buildTableReason(row, partySize),  
      }))  
    );  
  });  
    
  app.get('/api/reports/revenue', async (req, res) => {  
    const d = req.query.date || new Date().toISOString().slice(0, 10);  
    const [sets] = await pool.query('CALL sp_report_daily_revenue(?)', [d]);  
    const rows = sets[0] || [];  
    res.json(rows[0] || null);  
  });  
    
  app.get('/api/reports/game-popularity', async (req, res) => {  
    const days = Math.min(365, Math.max(1, Number(req.query.days || 30)));  
    const [sets] = await pool.query('CALL sp_report_game_popularity(?)', [days]);  
    res.json(sets[0] || []);  
  });  
    
  app.get('/api/reports/table-utilization', async (req, res) => {  
    const days = Math.min(365, Math.max(1, Number(req.query.days || 30)));  
    const [sets] = await pool.query('CALL sp_report_table_utilization(?)', [days]);  
    res.json(sets[0] || []);  
  });

  // 营收趋势：按天聚合最近 N 天的结算收入与单量，用于数据大屏折线图。
  // 用日历序列补齐无营收的日期，保证前端拿到连续的逐日序列。
  app.get('/api/reports/revenue-trend', async (req, res) => {
    const days = Math.min(180, Math.max(1, Number(req.query.days || 30)));
    const [rows] = await pool.query(
      `SELECT DATE(s.ended_at) AS day,
              ROUND(SUM(s.amount_cents) / 100, 2) AS revenueYuan,
              COUNT(*) AS settledSessions,
              IFNULL(SUM(s.billed_minutes), 0) AS billedMinutes
         FROM play_sessions s
        WHERE s.ended_at IS NOT NULL
          AND s.ended_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
        GROUP BY DATE(s.ended_at)
        ORDER BY day ASC`,
      [days - 1]
    );
    const keyOf = (value) => {
      const d = value instanceof Date ? value : new Date(value);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    const byDay = new Map(rows.map((row) => [keyOf(row.day), row]));
    const series = [];
    const today = new Date();
    for (let i = days - 1; i >= 0; i -= 1) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      const key = keyOf(d);
      const hit = byDay.get(key);
      series.push({
        day: key,
        label: `${d.getMonth() + 1}/${d.getDate()}`,
        revenueYuan: hit ? Number(hit.revenueYuan) : 0,
        settledSessions: hit ? Number(hit.settledSessions) : 0,
        billedMinutes: hit ? Number(hit.billedMinutes) : 0,
      });
    }
    res.json(series);
  });
}
