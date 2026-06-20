

export function registerGamesRoutes(app, ctx) {
  const { pool, sendError, requireAuth, requireTenantAdmin, tenantId } = ctx;

  app.get('/api/games', async (_req, res) => {
    try {
      const [rows] = await pool.query(
        `SELECT
                g.id, g.title, g.cover_image_url AS coverImageUrl, g.rules_pdf_url AS rulesPdfUrl,
                g.min_players AS minPlayers, g.max_players AS maxPlayers, g.category,
                g.difficulty_level AS difficultyLevel, g.avg_minutes AS avgMinutes,
                g.recommend_weight AS recommendWeight, g.description, g.publisher,
                g.publish_year AS publishYear, g.bgg_id AS bggId,
                COUNT(gr.id) AS playCount,
                IFNULL(SUM(gr.played_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)), 0) AS recentPlayCount,
                MAX(gr.played_at) AS lastPlayedAt,
                ROUND(
                  IFNULL(SUM(gr.played_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)), 0) * 2
                  + COUNT(gr.id) * 0.25
                  + g.recommend_weight * 5,
                  2
                ) AS hotScore
         FROM games g
         LEFT JOIN game_records gr ON gr.game_id = g.id
         GROUP BY g.id, g.title, g.cover_image_url, g.rules_pdf_url, g.min_players, g.max_players,
                  g.category, g.difficulty_level, g.avg_minutes, g.recommend_weight,
                  g.description, g.publisher, g.publish_year, g.bgg_id
         ORDER BY hotScore DESC, recentPlayCount DESC, g.recommend_weight DESC, g.title ASC`
      );
      res.json(rows);
    } catch (error) {
      if (error.code !== 'ER_BAD_FIELD_ERROR') {
        console.error('[ERROR] games:', error);
        return sendError(res, 500, 'database_error', error.message);
      }
      const [rows] = await pool.query(
        `SELECT
                g.id, g.title, g.cover_image_url AS coverImageUrl, g.rules_pdf_url AS rulesPdfUrl,
                g.min_players AS minPlayers, g.max_players AS maxPlayers, g.category,
                g.difficulty_level AS difficultyLevel, g.avg_minutes AS avgMinutes,
                g.recommend_weight AS recommendWeight,
                COUNT(gr.id) AS playCount,
                IFNULL(SUM(gr.played_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)), 0) AS recentPlayCount,
                MAX(gr.played_at) AS lastPlayedAt,
                ROUND(
                  IFNULL(SUM(gr.played_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)), 0) * 2
                  + COUNT(gr.id) * 0.25
                  + g.recommend_weight * 5,
                  2
                ) AS hotScore
         FROM games g
         LEFT JOIN game_records gr ON gr.game_id = g.id
         GROUP BY g.id, g.title, g.cover_image_url, g.rules_pdf_url, g.min_players, g.max_players,
                  g.category, g.difficulty_level, g.avg_minutes, g.recommend_weight
         ORDER BY hotScore DESC, recentPlayCount DESC, g.recommend_weight DESC, g.title ASC`
      );
      res.json(rows);
    }
  });
  
  app.get('/api/games-mgmt/list', requireAuth, async (req, res) => {  
    try {  
      const tid = tenantId(req);
      const search = String(req.query.search || '').trim();
      const statsJoin = `
        LEFT JOIN (
          SELECT
            game_id,
            COUNT(*) AS playCount,
            IFNULL(SUM(played_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)), 0) AS recentPlayCount,
            MAX(played_at) AS lastPlayedAt
          FROM game_records
          GROUP BY game_id
        ) gs ON gs.game_id = g.id`;
      const baseSelect = `SELECT g.id, g.title, g.cover_image_url AS coverImageUrl, g.category,
                          g.min_players AS minPlayers, g.max_players AS maxPlayers,
                          g.difficulty_level AS difficulty, g.avg_minutes AS avgMinutes,
                          g.description, g.publisher, g.publish_year AS publishYear, g.bgg_id AS bggId,
                          IFNULL(gs.playCount, 0) AS playCount,
                          IFNULL(gs.recentPlayCount, 0) AS recentPlayCount,
                          gs.lastPlayedAt AS lastPlayedAt,
                          ROUND(IFNULL(gs.recentPlayCount, 0) * 2 + IFNULL(gs.playCount, 0) * 0.25 + g.recommend_weight * 5, 2) AS hotScore`;
      if (!search) {
        const [rows] = await pool.query(
          `${baseSelect} FROM games g ${statsJoin} WHERE g.tenant_id = ? ORDER BY hotScore DESC, g.created_at DESC`,
          [tid]
        );
        return res.json({ data: rows });
      }  
      // 优先全文检索（按相关度排序）  
      const [ftRows] = await pool.query(
        `${baseSelect},
          MATCH(g.title, g.category, g.description) AGAINST(? IN NATURAL LANGUAGE MODE) AS relevance
         FROM games g
         ${statsJoin}
         WHERE g.tenant_id = ?
           AND MATCH(g.title, g.category, g.description) AGAINST(? IN NATURAL LANGUAGE MODE)
         ORDER BY relevance DESC, hotScore DESC`,
        [search, tid, search]
      );
      if (ftRows.length) return res.json({ data: ftRows });  
      // 回退 LIKE（短词/ngram 未命中时的双保险）  
      const like = `%${search}%`;
      const [likeRows] = await pool.query(
        `${baseSelect} FROM games g
         ${statsJoin}
         WHERE g.tenant_id = ? AND (g.title LIKE ? OR g.description LIKE ? OR g.category LIKE ?)
         ORDER BY hotScore DESC, g.created_at DESC`,
        [tid, like, like, like]
      );
      res.json({ data: likeRows });  
    } catch (e) { console.error(e); sendError(res, 500, 'db_error'); }  
  });  
    
  app.get('/api/games-mgmt/:id', requireAuth, async (req, res) => {  
    try {  
      const tid = tenantId(req);  
      const [[row]] = await pool.query(  
        `SELECT id, title, cover_image_url AS coverImageUrl, rules_pdf_url AS rulesPdfUrl, category,  
                min_players AS minPlayers, max_players AS maxPlayers, difficulty_level AS difficulty,  
                avg_minutes AS avgMinutes, description, publisher, publish_year AS publishYear,  
                bgg_id AS bggId, recommend_weight AS recommendWeight, created_at AS createdAt  
         FROM games WHERE id=? AND tenant_id=?`, [req.params.id, tid]);  
      if (!row) return sendError(res, 404, 'not_found');  
      res.json(row);  
    } catch (e) { console.error(e); sendError(res, 500, 'db_error'); }  
  });  
    
  app.post('/api/games-mgmt/create', requireTenantAdmin, async (req, res) => {
    try {  
      const tid = tenantId(req);  
      const { title, coverImageUrl, rulesPdfUrl, category, minPlayers, maxPlayers, difficulty, avgMinutes, description, publisher, publishYear, bggId } = req.body||{};  
      if (!title) return sendError(res, 400, 'missing_title');  
      const [r] = await pool.query(  
        `INSERT INTO games (tenant_id,title,cover_image_url,rules_pdf_url,category,min_players,max_players,difficulty_level,avg_minutes,description,publisher,publish_year,bgg_id)  
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,  
        [tid, title, coverImageUrl||null, rulesPdfUrl||null, category||'综合', minPlayers||2, maxPlayers||6, difficulty||3, avgMinutes||90, description||null, publisher||null, publishYear||null, bggId||null]);  
      res.status(201).json({ id: r.insertId });  
    } catch (e) { console.error(e); sendError(res, 500, 'db_error'); }  
  });  
    
  app.patch('/api/games-mgmt/:id', requireTenantAdmin, async (req, res) => {
    try {  
      const tid = tenantId(req);  
      const fields = ['title','cover_image_url','rules_pdf_url','category','min_players','max_players','difficulty_level','avg_minutes','description','publisher','publish_year','bgg_id','recommend_weight'];  
      const sets = [], params = [];  
      for (const f of fields) {  
        const key = f.replace(/_([a-z])/g, (_,c)=>c.toUpperCase()).replace(/_/g,'');  
        if (req.body[key] !== undefined) { sets.push(`${f}=?`); params.push(req.body[key]); }  
      }  
      if (!sets.length) return sendError(res, 400, 'no_fields');  
      params.push(req.params.id, tid);  
      await pool.query(`UPDATE games SET ${sets.join(',')} WHERE id=? AND tenant_id=?`, params);  
      res.json({ ok: true });  
    } catch (e) { console.error(e); sendError(res, 500, 'db_error'); }  
  });  
    
  app.delete('/api/games-mgmt/:id', requireTenantAdmin, async (req, res) => {  
    try {  
      const tid = tenantId(req);  
      await pool.query('DELETE FROM games WHERE id=? AND tenant_id=?', [req.params.id, tid]);  
      res.json({ ok: true });  
    } catch (e) { console.error(e); sendError(res, 500, 'db_error'); }  
  });  
    
  // =====================================================================  
  // Phase B: 桌游租借服务  
  // =====================================================================  
    
  // 库存统计：可借/借出中/逾期/维护
}
