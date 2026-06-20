import { normalizeMysqlDatetimeInput } from './route-utils.js';

export function registerMembersRoutes(app, ctx) {
  const { pool, sendError, requireAuth, tenantId } = ctx;

  app.get('/api/members', async (req, res) => {  
    const q = String(req.query.q || '').trim();  
    const status = String(req.query.status || 'all');  
    const where = [];  
    const params = [];  
    let orderBy = 'status ASC, id DESC';
  
    where.push("member_no IS NOT NULL AND member_no <> '' AND phone IS NOT NULL AND phone <> ''");
  
    if (q) {  
      // 姓名走全文检索（相关度），手机号/会员号走 LIKE 精确匹配  
      const like = `%${q}%`;  
      where.push('(MATCH(display_name) AGAINST(? IN NATURAL LANGUAGE MODE) OR display_name LIKE ? OR phone LIKE ? OR member_no LIKE ?)');  
      params.push(q, like, like, like);  
      // 相关度排序：全文命中优先  
      orderBy = 'MATCH(display_name) AGAINST(? IN NATURAL LANGUAGE MODE) DESC, status ASC, id DESC';  
    }  
    if (status === 'active' || status === 'disabled') {  
      where.push('status = ?');  
      params.push(status);  
    }  
    if (q) params.push(q); // for ORDER BY relevance  
    
    const [rows] = await pool.query(  
      `SELECT id, member_no AS memberNo, display_name AS displayName, phone, avatar_url AS avatarUrl,  
              balance_cents AS balanceCents, total_recharged_cents AS totalRechargedCents,  
              total_spent_cents AS totalSpentCents, status, created_at AS createdAt  
       FROM players  
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}  
       ORDER BY ${orderBy}  
       LIMIT 10`,  
      params  
    );  
    res.json(rows);  
  });  
    
  app.get('/api/members/:id/reservations', requireAuth, async (req, res) => {  
    const id = Number(req.params.id);  
    if (!id) return sendError(res, 400, 'invalid_member_id');  
    
    const [rows] = await pool.query(  
      `SELECT r.id, r.table_id AS tableId, t.code AS tableCode,  
              t.seat_capacity AS seatCapacity, t.area_type AS areaType,  
              r.player_id AS playerId, p.display_name AS playerName, p.phone AS playerPhone,  
              r.guest_name AS guestName, r.guest_phone AS guestPhone, r.party_size AS partySize,  
              r.reserved_start AS reservedStart, r.reserved_end AS reservedEnd,  
              r.status, r.created_at AS createdAt  
       FROM reservations r  
       INNER JOIN game_tables t ON t.id = r.table_id  
       LEFT JOIN players p ON p.id = r.player_id  
       WHERE r.player_id = ?  
       ORDER BY r.reserved_start DESC  
       LIMIT 80`,  
      [id]  
    );  
    res.json(rows);  
  });  
    
  app.post('/api/members', requireAuth, async (req, res) => {  
    const displayName = String(req.body?.displayName || '').trim();  
    const phone = req.body?.phone == null ? null : String(req.body.phone).trim();  
    const avatarUrl = req.body?.avatarUrl == null ? null : String(req.body.avatarUrl).trim();  
    const initialBalanceCents = Math.max(0, Math.round(Number(req.body?.initialBalanceYuan || 0) * 100));  
    
    if (!displayName) {  
      return sendError(res, 400, 'missing_display_name');  
    }  
    if (!phone) {  
      return sendError(res, 400, 'invalid_phone');  
    }  
    
    const conn = await pool.getConnection();  
    try {  
      await conn.beginTransaction();  
      const [result] = await conn.query(  
        `INSERT INTO players (display_name, phone, avatar_url, balance_cents, total_recharged_cents)  
         VALUES (?, ?, ?, ?, ?)`,  
        [displayName, phone || null, avatarUrl || null, initialBalanceCents, initialBalanceCents]  
      );  
      const id = result.insertId;  
      const memberNo = `MB${new Date().getFullYear()}${String(id).padStart(5, '0')}`;  
      await conn.query('UPDATE players SET member_no = ? WHERE id = ?', [memberNo, id]);  
      await conn.commit();  
      res.status(201).json({ id, memberNo });  
    } catch (e) {  
      await conn.rollback();  
      sendError(res, 500, 'database_error', String(e.message));  
    } finally {  
      conn.release();  
    }  
  });  
    
  app.post('/api/members/:id/recharge', requireAuth, async (req, res) => {  
    const id = Number(req.params.id);  
    const amountCents = Math.round(Number(req.body?.amountYuan || 0) * 100);  
    if (!id || amountCents <= 0) {  
      return sendError(res, 400, 'invalid_amount');  
    }  
    const [result] = await pool.query(  
      `UPDATE players  
       SET balance_cents = balance_cents + ?, total_recharged_cents = total_recharged_cents + ?  
       WHERE id = ? AND status = 'active'`,  
      [amountCents, amountCents, id]  
    );  
    if (result.affectedRows === 0) return sendError(res, 404, 'member_not_found');  
    res.json({ ok: true });  
  });  
    
  app.post('/api/members/:id/consume', requireAuth, async (req, res) => {  
    const id = Number(req.params.id);  
    const amountCents = Math.round(Number(req.body?.amountYuan || 0) * 100);  
    if (!id || amountCents <= 0) {  
      return sendError(res, 400, 'invalid_amount');  
    }  
    const [result] = await pool.query(  
      `UPDATE players  
       SET balance_cents = balance_cents - ?, total_spent_cents = total_spent_cents + ?  
       WHERE id = ? AND status = 'active' AND balance_cents >= ?`,  
      [amountCents, amountCents, id, amountCents]  
    );  
    if (result.affectedRows === 0) {  
      return sendError(res, 409, 'insufficient_balance');  
    }  
    res.json({ ok: true });  
  });  
    
  app.delete('/api/members/:id', requireAuth, async (req, res) => {  
    const id = Number(req.params.id);  
    const [result] = await pool.query(`UPDATE players SET status = 'disabled' WHERE id = ?`, [id]);  
    if (result.affectedRows === 0) return sendError(res, 404, 'member_not_found');  
    res.json({ ok: true });  
  });
  
  app.get('/api/members-mgmt/stats', requireAuth, async (req, res) => {  
    try {  
      const tid = tenantId(req);  
      const [[result]] = await pool.query(`  
        SELECT COUNT(*) as totalMembers,  
          SUM(CASE WHEN membershipLevel='bronze' THEN 1 ELSE 0 END) as bronze,  
          SUM(CASE WHEN membershipLevel='silver' THEN 1 ELSE 0 END) as silver,  
          SUM(CASE WHEN membershipLevel='gold' THEN 1 ELSE 0 END) as gold,  
          SUM(CASE WHEN membershipLevel='platinum' THEN 1 ELSE 0 END) as platinum,  
          SUM(CASE WHEN membershipLevel='diamond' THEN 1 ELSE 0 END) as diamond,  
          SUM(total_spent_cents) as totalSpent,  
          SUM(points) as totalPoints  
        FROM players WHERE tenant_id = ?  
          AND member_no IS NOT NULL AND member_no <> ''  
          AND phone IS NOT NULL AND phone <> ''  
      `, [tid]);  
      res.json({  
        totalMembers: result?.totalMembers || 0,  
        byLevel: { bronze: result?.bronze||0, silver: result?.silver||0, gold: result?.gold||0, platinum: result?.platinum||0, diamond: result?.diamond||0 },  
        totalSpent: result?.totalSpent || 0,  
        avgSpent: result?.totalMembers > 0 ? Math.floor((result?.totalSpent||0)/result.totalMembers) : 0,  
        totalPoints: result?.totalPoints || 0,  
      });  
    } catch (e) { console.error(e); sendError(res, 500, 'db_error'); }  
  });  
    
  app.get('/api/members-mgmt/list', requireAuth, async (req, res) => {  
    try {  
      const tid = tenantId(req);  
      const skip = Number(req.query.skip)||0, take = Math.min(10, Number(req.query.take)||10);  
      const [rows] = await pool.query(  
        `SELECT id, member_no AS memberNo, display_name AS displayName, phone,  
                membershipLevel, points, total_spent_cents AS totalSpentCents,  
                balance_cents AS balanceCents, created_at AS createdAt  
         FROM players WHERE tenant_id = ?  
          AND member_no IS NOT NULL AND member_no <> ''  
          AND phone IS NOT NULL AND phone <> '' ORDER BY created_at DESC LIMIT ? OFFSET ?`,  
        [tid, take, skip]);  
      res.json({ data: rows });  
    } catch (e) { console.error(e); sendError(res, 500, 'db_error'); }  
  });  
    
  // ---------- 优惠券管理 ----------  
  app.get('/api/coupons-mgmt/list', requireAuth, async (req, res) => {  
    try {  
      const tid = tenantId(req);  
      const skip = Number(req.query.skip)||0, take = Number(req.query.take)||20;  
      const [rows] = await pool.query(  
        `SELECT id, name, type, value, min_amount AS minAmount, total_qty AS totalQty, used_qty AS usedQty,  
                start_at AS startAt, end_at AS endAt, valid_on AS validOn, created_at AS createdAt  
         FROM coupons WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`,  
        [tid, take, skip]);  
      res.json({ data: rows });  
    } catch (e) { console.error(e); sendError(res, 500, 'db_error'); }  
  });  
    
  app.post('/api/coupons-mgmt/create', requireAuth, async (req, res) => {  
    try {  
      const tid = tenantId(req);  
      const { name, type, value, minAmount, totalQty, startAt, endAt, validOn } = req.body||{};  
      if (!name||!type||!value||!totalQty||!startAt||!endAt) return sendError(res, 400, 'missing');  
      const start = normalizeMysqlDatetimeInput(startAt);
      const end = normalizeMysqlDatetimeInput(endAt);
      const [r] = await pool.query(  
        `INSERT INTO coupons (tenant_id,name,type,value,min_amount,total_qty,start_at,end_at,valid_on) VALUES (?,?,?,?,?,?,?,?,?)`,  
        [tid,name,type,value,minAmount||0,totalQty,start,end,validOn||'all']);  
      res.status(201).json({ id: r.insertId });  
    } catch (e) { console.error(e); sendError(res, 500, 'db_error'); }  
  });  
    
  // ---------- 订单计费 ----------  
  app.get('/api/billing-mgmt/stats', requireAuth, async (req, res) => {  
    try {  
      const tid = tenantId(req);  
      const [[r]] = await pool.query(  
        `SELECT COUNT(*) as totalOrders,  
          SUM(CASE WHEN status='paid' THEN 1 ELSE 0 END) as paidOrders,  
          SUM(CASE WHEN status='paid' THEN final_cents ELSE 0 END) as totalRevenue,  
          SUM(CASE WHEN status='paid' THEN discount_cents ELSE 0 END) as totalDiscount  
         FROM orders WHERE tenant_id = ?`, [tid]);  
      res.json({  
        totalOrders: r?.totalOrders||0, paidOrders: r?.paidOrders||0,  
        totalRevenue: r?.totalRevenue||0, totalDiscount: r?.totalDiscount||0,  
        avgOrderValue: r?.paidOrders>0 ? Math.floor((r?.totalRevenue||0)/r.paidOrders) : 0,  
      });  
    } catch (e) { console.error(e); sendError(res, 500, 'db_error'); }  
  });  
    
  app.get('/api/billing-mgmt/orders', requireAuth, async (req, res) => {  
    try {  
      const tid = tenantId(req);  
      const skip = Number(req.query.skip)||0, take = Number(req.query.take)||20;  
      const [rows] = await pool.query(  
        `SELECT o.id, o.order_no AS orderNo, o.amount_cents AS amountCents, o.discount_cents AS discountCents,  
                o.final_cents AS finalCents, o.status, o.created_at AS createdAt,  
                p.display_name AS playerName, p.phone AS playerPhone  
         FROM orders o LEFT JOIN players p ON p.id=o.player_id  
         WHERE o.tenant_id = ? ORDER BY o.created_at DESC LIMIT ? OFFSET ?`,  
        [tid, take, skip]);  
      res.json({ data: rows });  
    } catch (e) { console.error(e); sendError(res, 500, 'db_error'); }  
  });  
    
  // ---------- 员工权限管理（租户管理员） ----------
}
