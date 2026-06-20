

export function registerRentalRoutes(app, ctx) {
  const { pool, sendError, requireAuth, requireTenantAdmin } = ctx;

  app.get('/api/public/rental/games', async (_req, res) => {
    try {
      const [rows] = await pool.query(
        `SELECT
          g.id AS gameId,
          g.title,
          g.cover_image_url AS coverImageUrl,
          g.category,
          g.min_players AS minPlayers,
          g.max_players AS maxPlayers,
          g.avg_minutes AS avgMinutes,
          COUNT(c.id) AS availableCopies,
          MIN(c.deposit_cents) AS depositCents,
          GROUP_CONCAT(DISTINCT NULLIF(c.location, '') ORDER BY c.location SEPARATOR '、') AS locations
         FROM game_copies c
         INNER JOIN games g ON g.id = c.game_id
         WHERE c.status = 'available'
         GROUP BY g.id, g.title, g.cover_image_url, g.category, g.min_players, g.max_players, g.avg_minutes
         ORDER BY availableCopies DESC, g.title ASC
         LIMIT 24`
      );
      res.json({ data: rows });
    } catch (e) {
      if (e.code && e.code !== 'ER_NO_SUCH_TABLE' && e.code !== 'ER_BAD_FIELD_ERROR') {
        console.error('[ERROR] public rental:', e);
      }
      res.json({ data: [] });
    }
  });
  
  app.get('/api/rental/stats', requireAuth, async (_req, res) => {
    try {  
      const [[copyStats]] = await pool.query(  
        `SELECT  
          COUNT(*) AS total,  
          SUM(status='available') AS available,  
          SUM(status='lent') AS lent,  
          SUM(status='maintenance') AS maintenance,  
          SUM(status='lost') AS lost  
         FROM game_copies`  
      );  
      const [[loanStats]] = await pool.query(  
        `SELECT  
          SUM(status='active') AS active,  
          SUM(status='active' AND due_at IS NOT NULL AND due_at < NOW()) AS overdue  
         FROM game_loans`  
      );  
      res.json({  
        total: Number(copyStats.total) || 0,  
        available: Number(copyStats.available) || 0,  
        lent: Number(copyStats.lent) || 0,  
        maintenance: Number(copyStats.maintenance) || 0,  
        lost: Number(copyStats.lost) || 0,  
        activeLoans: Number(loanStats.active) || 0,  
        overdueLoans: Number(loanStats.overdue) || 0,  
      });  
    } catch (e) { console.error(e); sendError(res, 500, 'db_error'); }  
  });  
    
  // 副本列表（可按 gameId 过滤）  
  app.get('/api/rental/copies', requireAuth, async (req, res) => {  
    try {  
      const gameId = req.query.gameId ? Number(req.query.gameId) : null;  
      const params = [];  
      let where = '';  
      if (gameId) { where = 'WHERE c.game_id = ?'; params.push(gameId); }  
      const [rows] = await pool.query(  
        `SELECT c.id, c.game_id AS gameId, g.title AS gameTitle, c.barcode, c.status,  
                c.condition_note AS conditionNote, c.location, c.deposit_cents AS depositCents,  
                c.created_at AS createdAt  
         FROM game_copies c  
         INNER JOIN games g ON g.id = c.game_id  
         ${where}  
         ORDER BY g.title ASC, c.id ASC  
         LIMIT 500`,  
        params  
      );  
      res.json({ data: rows });  
    } catch (e) { console.error(e); sendError(res, 500, 'db_error'); }  
  });  
    
  // 新增副本  
  app.post('/api/rental/copies', requireTenantAdmin, async (req, res) => {
    try {  
      const { gameId, barcode, conditionNote, location, depositCents } = req.body || {};  
      if (!gameId) return sendError(res, 400, 'missing_fields');  
      const [r] = await pool.query(  
        `INSERT INTO game_copies (game_id, barcode, condition_note, location, deposit_cents)  
         VALUES (?, ?, ?, ?, ?)`,  
        [Number(gameId), barcode || null, conditionNote || null, location || null, Number(depositCents) || 0]  
      );  
      res.status(201).json({ id: r.insertId });  
    } catch (e) { console.error(e); sendError(res, 500, 'db_error'); }  
  });  
    
  // 更新副本（状态/位置/押金等）  
  app.patch('/api/rental/copies/:id', requireTenantAdmin, async (req, res) => {
    try {  
      const { status, conditionNote, location, depositCents, barcode } = req.body || {};  
      const sets = [], params = [];  
      if (status) { sets.push('status=?'); params.push(status); }  
      if (conditionNote !== undefined) { sets.push('condition_note=?'); params.push(conditionNote || null); }  
      if (location !== undefined) { sets.push('location=?'); params.push(location || null); }  
      if (depositCents !== undefined) { sets.push('deposit_cents=?'); params.push(Number(depositCents) || 0); }  
      if (barcode !== undefined) { sets.push('barcode=?'); params.push(barcode || null); }  
      if (!sets.length) return res.json({ ok: true });  
      params.push(req.params.id);  
      await pool.query(`UPDATE game_copies SET ${sets.join(', ')} WHERE id=?`, params);  
      res.json({ ok: true });  
    } catch (e) { console.error(e); sendError(res, 500, 'db_error'); }  
  });  
    
  // 删除副本（借出中不可删）  
  app.delete('/api/rental/copies/:id', requireTenantAdmin, async (req, res) => {  
    try {  
      const [[copy]] = await pool.query('SELECT status FROM game_copies WHERE id=?', [req.params.id]);  
      if (!copy) return sendError(res, 404, 'not_found');  
      if (copy.status === 'lent') return sendError(res, 409, 'copy_lent');  
      await pool.query('DELETE FROM game_copies WHERE id=?', [req.params.id]);  
      res.json({ ok: true });  
    } catch (e) { console.error(e); sendError(res, 500, 'db_error'); }  
  });  
    
  // 借出记录列表（status: active|overdue|returned|all）  
  app.get('/api/rental/loans', requireAuth, async (req, res) => {  
    try {  
      const status = String(req.query.status || 'active');  
      let where = '';  
      if (status === 'active') where = "WHERE l.status='active'";  
      else if (status === 'overdue') where = "WHERE l.status='active' AND l.due_at IS NOT NULL AND l.due_at < NOW()";  
      else if (status === 'returned') where = "WHERE l.status='returned'";  
      const [rows] = await pool.query(  
        `SELECT l.id, l.copy_id AS copyId, l.game_id AS gameId, g.title AS gameTitle,  
                c.barcode, l.player_id AS playerId, p.display_name AS playerName, p.phone AS playerPhone,  
                l.borrowed_at AS borrowedAt, l.due_at AS dueAt, l.returned_at AS returnedAt,  
                l.deposit_cents AS depositCents, l.status, l.notes,  
                (l.status='active' AND l.due_at IS NOT NULL AND l.due_at < NOW()) AS isOverdue  
         FROM game_loans l  
         INNER JOIN games g ON g.id = l.game_id  
         INNER JOIN game_copies c ON c.id = l.copy_id  
         LEFT JOIN players p ON p.id = l.player_id  
         ${where}  
         ORDER BY l.borrowed_at DESC  
         LIMIT 300`  
      );  
      res.json({ data: rows });  
    } catch (e) { console.error(e); sendError(res, 500, 'db_error'); }  
  });  
    
  // 借出（校验副本可借，原子更新副本状态）  
  app.post('/api/rental/loans', requireAuth, async (req, res) => {  
    const { copyId, playerId, dueAt, depositCents, notes } = req.body || {};  
    if (!copyId) return sendError(res, 400, 'missing_fields');  
    const conn = await pool.getConnection();  
    try {  
      await conn.beginTransaction();  
      const [[copy]] = await conn.query('SELECT id, game_id, status, deposit_cents FROM game_copies WHERE id=? FOR UPDATE', [Number(copyId)]);  
      if (!copy) { await conn.rollback(); return sendError(res, 404, 'copy_not_found'); }  
      if (copy.status !== 'available') { await conn.rollback(); return sendError(res, 409, 'copy_not_available'); }  
      const deposit = depositCents !== undefined ? Number(depositCents) || 0 : copy.deposit_cents;  
      const [r] = await conn.query(  
        `INSERT INTO game_loans (copy_id, game_id, player_id, staff_id, due_at, deposit_cents, notes, status)  
         VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`,  
        [copy.id, copy.game_id, playerId ? Number(playerId) : null, req.user?.staffId || null,  
         dueAt ? String(dueAt).replace('T', ' ').slice(0, 19) : null, deposit, notes || null]  
      );  
      await conn.query("UPDATE game_copies SET status='lent' WHERE id=?", [copy.id]);  
      await conn.commit();  
      res.status(201).json({ id: r.insertId });  
    } catch (e) {  
      await conn.rollback();  
      console.error('[ERROR] loan borrow:', e);  
      sendError(res, 500, 'db_error');  
    } finally { conn.release(); }  
  });  
    
  // 归还（计算是否逾期，释放副本）  
  app.post('/api/rental/loans/:id/return', requireAuth, async (req, res) => {  
    const markLost = req.body?.markLost === true;  
    const conn = await pool.getConnection();  
    try {  
      await conn.beginTransaction();  
      const [[loan]] = await conn.query('SELECT id, copy_id, status, due_at FROM game_loans WHERE id=? FOR UPDATE', [req.params.id]);  
      if (!loan) { await conn.rollback(); return sendError(res, 404, 'loan_not_found'); }  
      if (loan.status !== 'active') { await conn.rollback(); return sendError(res, 409, 'loan_not_active'); }  
      if (markLost) {  
        await conn.query("UPDATE game_loans SET status='lost', returned_at=NOW() WHERE id=?", [loan.id]);  
        await conn.query("UPDATE game_copies SET status='lost' WHERE id=?", [loan.copy_id]);  
      } else {  
        await conn.query("UPDATE game_loans SET status='returned', returned_at=NOW() WHERE id=?", [loan.id]);  
        await conn.query("UPDATE game_copies SET status='available' WHERE id=?", [loan.copy_id]);  
      }  
      await conn.commit();  
      const wasOverdue = loan.due_at && new Date(loan.due_at) < new Date();  
      res.json({ ok: true, overdue: !!wasOverdue, lost: markLost });  
    } catch (e) {  
      await conn.rollback();  
      console.error('[ERROR] loan return:', e);  
      sendError(res, 500, 'db_error');  
    } finally { conn.release(); }  
  });  
    
  // =====================================================================  
  // Phase D: LLM 大模型集成  
  // =====================================================================  
    
  // 配置状态（前端据此决定是否显示 AI 入口/提示未配置）
}
