

export function registerReservationRoutes(app, ctx) {
  const { pool, sendError, reservationErrorMessage, requireAuth, requirePlayerAuth, playerFromRequest, tenantId, callReserve, callCheckin, callCancelReservation, callWalkin, recommendTableForReservation, runOperationalMaintenance } = ctx;

  app.get('/api/reservations', async (_req, res) => {
    await runOperationalMaintenance({ silent: true });
    const [rows] = await pool.query(
      `SELECT r.id, r.table_id AS tableId, t.code AS tableCode, r.player_id AS playerId,  
              p.display_name AS playerName, p.phone AS playerPhone,  
              r.guest_name AS guestName, r.guest_phone AS guestPhone, r.party_size AS partySize,  
              r.reserved_start AS reservedStart, r.reserved_end AS reservedEnd, r.status  
       FROM reservations r  
       INNER JOIN game_tables t ON t.id = r.table_id  
       LEFT JOIN players p ON p.id = r.player_id  
       WHERE r.status IN ('pending', 'active')  
       ORDER BY r.reserved_start DESC LIMIT 200`  
    );  
    res.json(rows);  
  });  
    
  app.get('/api/sessions/open', async (_req, res) => {
    await runOperationalMaintenance({ silent: true });
    const [rows] = await pool.query(
      `SELECT s.id, s.table_id AS tableId, t.code AS tableCode, s.reservation_id AS reservationId,
              s.guest_name AS guestName, s.guest_phone AS guestPhone, s.party_size AS partySize,
              s.started_at AS startedAt, s.ended_at AS endedAt,
              r.reserved_end AS reservedEnd,
              r.player_id AS playerId, p.display_name AS playerName, p.phone AS playerPhone
       FROM play_sessions s  
       INNER JOIN game_tables t ON t.id = s.table_id  
       LEFT JOIN reservations r ON r.id = s.reservation_id  
       LEFT JOIN players p ON p.id = r.player_id  
       WHERE s.ended_at IS NULL  
       ORDER BY s.started_at DESC`  
    );  
    res.json(rows);  
  });  
    
  app.post('/api/public/reservations', async (req, res) => {
    const { tableId, guestName, guestPhone, partySize, reservedStart, reservedEnd } = req.body || {};
    const normalizedPartySize = Math.trunc(Number(partySize || 1));
    const normalizedName = String(guestName || '').trim();
    const normalizedPhone = guestPhone == null ? null : String(guestPhone).trim() || null;
  
    if (!Number.isFinite(normalizedPartySize) || normalizedPartySize < 1 || normalizedPartySize > 20) {
      return sendError(res, 400, 'invalid_party_size');
    }
    if (new Date(reservedStart) >= new Date(reservedEnd)) {  
      return sendError(res, 400, 'invalid_time_range');  
    }
  
    try {
      const player = await playerFromRequest(req, { optional: true });
      const effectiveName = player?.displayName || normalizedName;
      const effectivePhone = player?.phone || normalizedPhone;
      if (!effectiveName || !reservedStart || !reservedEnd) {
        return sendError(res, 400, 'missing_fields');
      }
  
      const pickedTable = tableId
        ? { tableId: Number(tableId), code: null, seatCapacity: null, areaType: null }
        : await recommendTableForReservation(normalizedPartySize, reservedStart, reservedEnd);
    
      if (!pickedTable) {  
        return sendError(res, 409, 'no_table_available');  
      }  
    
      const row = await callReserve(
        pickedTable.tableId,
        player?.id || null,
        effectiveName,
        effectivePhone,
        normalizedPartySize,
        reservedStart,
        reservedEnd
      );  
      if (row.errCode) {  
        return sendError(res, 409, row.errCode, reservationErrorMessage(row.errCode));  
      }  
    
      const [[table]] = await pool.query('SELECT id, code, seat_capacity AS seatCapacity, area_type AS areaType FROM game_tables WHERE id = ?', [pickedTable.tableId]);  
      res.status(201).json({  
        reservationId: Number(row.reservationId),  
        tableId: pickedTable.tableId,  
        tableCode: table?.code || pickedTable.code || null,  
        seatCapacity: table?.seatCapacity ?? pickedTable.seatCapacity,  
        areaType: table?.areaType || pickedTable.areaType || null,  
      });  
    } catch (e) {  
      console.error('[ERROR] POST /api/public/reservations:', e);  
      sendError(res, 500, 'database_error', String(e.message));  
    }
  });
  
  app.get('/api/public/me/reservations', requirePlayerAuth, async (req, res) => {
    const [rows] = await pool.query(
      `SELECT r.id, r.table_id AS tableId, t.code AS tableCode, r.player_id AS playerId,
              r.guest_name AS guestName, r.guest_phone AS guestPhone, r.party_size AS partySize,
              r.reserved_start AS reservedStart, r.reserved_end AS reservedEnd, r.status,
              s.id AS sessionId, s.started_at AS startedAt, s.ended_at AS endedAt,
              COALESCE(gr.recordCount, 0) AS recordCount, gr.lastRecordAt
       FROM reservations r
       INNER JOIN game_tables t ON t.id = r.table_id
       LEFT JOIN play_sessions s ON s.reservation_id = r.id
       LEFT JOIN (
         SELECT session_id, COUNT(*) AS recordCount, MAX(played_at) AS lastRecordAt
         FROM game_records
         GROUP BY session_id
       ) gr ON gr.session_id = s.id
       WHERE r.player_id = ?
       ORDER BY r.reserved_start DESC
       LIMIT 80`,
      [req.player.id]
    );
    res.json(rows);
  });
  
  app.post('/api/public/me/reservations/:id/records', requirePlayerAuth, async (req, res) => {
    const reservationId = Number(req.params.id);
    const gameId = Number(req.body?.gameId);
    const winnerMode = String(req.body?.winnerMode || 'self');
    const winnerName = String(req.body?.winnerDisplayName || '').trim();
    const scoreNote = String(req.body?.scoreNote || '').trim().slice(0, 500);
  
    if (!reservationId) return sendError(res, 404, 'reservation_not_found');
    if (!gameId) return sendError(res, 400, 'missing_gameId');
  
    const [[reservation]] = await pool.query(
      `SELECT r.id, r.status, s.id AS sessionId
       FROM reservations r
       LEFT JOIN play_sessions s ON s.reservation_id = r.id
       WHERE r.id = ? AND r.player_id = ?
       LIMIT 1`,
      [reservationId, req.player.id]
    );
    if (!reservation) return sendError(res, 404, 'reservation_not_found');
    if (!['active', 'completed'].includes(reservation.status)) return sendError(res, 409, 'session_not_started');
    if (!reservation.sessionId) return sendError(res, 409, 'session_not_started');
  
    const [[existingRecord]] = await pool.query('SELECT id FROM game_records WHERE session_id = ? LIMIT 1', [reservation.sessionId]);
    if (existingRecord) return sendError(res, 409, 'record_exists');
  
    const [[game]] = await pool.query('SELECT id, title FROM games WHERE id = ?', [gameId]);
    if (!game) return sendError(res, 404, 'game_not_found');
  
    let winnerPlayerId = null;
    let winnerDisplayName = null;
    if (winnerMode === 'self') {
      winnerPlayerId = req.player.id;
      winnerDisplayName = req.player.displayName;
    } else if (winnerMode === 'other') {
      winnerDisplayName = winnerName || '其他玩家';
    }
  
    const scoreJson = {
      source: 'customer',
      winnerMode,
      note: scoreNote || null,
      submittedByPlayerId: req.player.id,
      submittedAt: new Date().toISOString(),
    };
  
    const [result] = await pool.query(
      `INSERT INTO game_records (session_id, game_id, title_snapshot, winner_player_id, winner_display_name, score_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [reservation.sessionId, gameId, game.title, winnerPlayerId, winnerDisplayName, JSON.stringify(scoreJson)]
    );
  
    res.status(201).json({ recordId: result.insertId });
  });
  
  app.post('/api/reservations', requireAuth, async (req, res) => {
    const { tableId, playerId, guestName, guestPhone, partySize, reservedStart, reservedEnd } = req.body || {};
    const normalizedPartySize = Math.trunc(Number(partySize || 1));  
    
    // 输入验证  
    if (!tableId || !guestName || !reservedStart || !reservedEnd) {  
      return sendError(res, 400, 'missing_fields');  
    }  
    
    if (typeof guestName !== 'string' || guestName.trim().length === 0) {  
      return sendError(res, 400, 'invalid_guest_name');  
    }  
    
    if (!Number.isFinite(normalizedPartySize) || normalizedPartySize < 1 || normalizedPartySize > 20) {  
      return sendError(res, 400, 'invalid_party_size');  
    }  
    
    if (new Date(reservedStart) >= new Date(reservedEnd)) {  
      return sendError(res, 400, 'invalid_time_range');  
    }  
    
    try {  
      const row = await callReserve(  
        Number(tableId),  
        playerId == null ? null : Number(playerId),  
        String(guestName).trim(),  
        guestPhone == null ? null : String(guestPhone).trim() || null,  
        normalizedPartySize,  
        reservedStart,  
        reservedEnd  
      );  
      if (row.errCode) {  
        return sendError(res, 409, row.errCode, reservationErrorMessage(row.errCode));  
      }  
      res.status(201).json({ reservationId: Number(row.reservationId) });  
    } catch (e) {  
      console.error('[ERROR] POST /api/reservations:', e);  
      sendError(res, 500, 'database_error', String(e.message));  
    }  
  });  
    
  app.post('/api/reservations/:id/checkin', requireAuth, async (req, res) => {  
    const row = await callCheckin(Number(req.params.id));  
    if (row.errCode) {  
      return sendError(res, 409, row.errCode);  
    }  
    res.json({ sessionId: Number(row.sessionId) });  
  });  
    
  app.post('/api/reservations/:id/cancel', requireAuth, async (req, res) => {  
    const row = await callCancelReservation(Number(req.params.id));  
    if (row.errCode) {  
      return sendError(res, 409, row.errCode);  
    }  
    res.json({ ok: true });  
  });  
    
  app.post('/api/sessions/walkin', requireAuth, async (req, res) => {  
    const { tableId, guestName, guestPhone, partySize } = req.body || {};  
    const normalizedPartySize = Math.trunc(Number(partySize || 1));  
    const normalizedGuestName = guestName == null ? null : String(guestName).trim() || null;  
    const normalizedGuestPhone = guestPhone == null ? null : String(guestPhone).trim() || null;  
    if (!tableId) {  
      return sendError(res, 400, 'missing_tableId');  
    }  
    if (!Number.isFinite(normalizedPartySize) || normalizedPartySize < 1 || normalizedPartySize > 20) {  
      return sendError(res, 400, 'invalid_party_size');  
    }  
    try {  
      const row = await callWalkin(Number(tableId), normalizedGuestName, normalizedGuestPhone, normalizedPartySize);  
      if (row.errCode) {  
        return sendError(res, 409, row.errCode, reservationErrorMessage(row.errCode));  
      }  
      res.status(201).json({ sessionId: Number(row.sessionId) });  
    } catch (e) {  
      console.error('[ERROR] POST /api/sessions/walkin:', e);  
      sendError(res, 500, 'database_error', String(e.message));  
    }  
  });  
    
  app.post('/api/sessions/:id/settle', requireAuth, async (req, res) => {  
    const tid = tenantId(req);  
    const billedMinutes = Number(req.body?.billedMinutes ?? 0);  
    const amountCents = Number(req.body?.amountCents ?? 0);  
    const notes = req.body?.notes ?? null;  
    const couponId = req.body?.couponId || null; // optional: apply a specific coupon  
    
    const conn = await pool.getConnection();  
    try {  
      await conn.beginTransaction();  
    
      // 1. Settle the session  
      const [settleRows] = await conn.query('CALL sp_end_session_settle(?, ?, ?, ?, @out_err)', [req.params.id, billedMinutes, amountCents, notes]);  
      const [[settleResult]] = await conn.query('SELECT @out_err AS errCode');  
      if (settleResult.errCode) {  
        await conn.rollback();  
        conn.release();  
        return sendError(res, 409, settleResult.errCode);  
      }  
    
      // 2. Find player from session's reservation + venue from table  
      const [[session]] = await conn.query(  
        `SELECT s.table_id, r.player_id, t.venue_id  
         FROM play_sessions s  
         LEFT JOIN reservations r ON r.id = s.reservation_id  
         INNER JOIN game_tables t ON t.id = s.table_id  
         WHERE s.id=? AND s.tenant_id=?`, [req.params.id, tid]);  
    
      const playerId = session?.player_id || null;  
      const venueId = session?.venue_id || 1;  
    
      // 3. Calculate member discount  
      let memberDiscount = 0;  
      if (playerId) {  
        const [[player]] = await conn.query(  
          'SELECT membershipLevel FROM players WHERE id=? AND tenant_id=?', [playerId, tid]);  
        if (player) {  
          const rates = { bronze: 10000, silver: 9700, gold: 9500, platinum: 9300, diamond: 9000 };  
          const rate = rates[player.membershipLevel] || 10000;  
          memberDiscount = Math.floor((amountCents * (10000 - rate)) / 10000);  
        }  
      }  
    
      // 4. Apply coupon if provided  
      let couponDiscount = 0, appliedCouponId = null;  
      if (couponId && playerId) {  
        const [[mc]] = await conn.query(  
          `SELECT mc.id, c.value, c.type, c.min_amount FROM member_coupons mc  
           INNER JOIN coupons c ON c.id=mc.coupon_id  
           WHERE mc.coupon_id=? AND mc.player_id=? AND mc.status='unused' AND c.tenant_id=?`, [couponId, playerId, tid]);  
        if (mc && amountCents >= mc.min_amount) {  
          couponDiscount = mc.type === 'discount_fixed' ? mc.value : Math.floor((amountCents * mc.value) / 10000);  
          appliedCouponId = couponId;  
          await conn.query('UPDATE member_coupons SET status=?, used_at=NOW() WHERE id=?', ['used', mc.id]);  
        }  
      }  
    
      const totalDiscount = memberDiscount + couponDiscount;  
      const finalAmount = Math.max(0, amountCents - totalDiscount);  
    
      // 5. Create order  
      const orderNo = `ORD-${Date.now()}-${String(req.params.id).padStart(4,'0')}`;  
      await conn.query(  
        `INSERT INTO orders (tenant_id, venue_id, player_id, order_no, amount_cents, discount_cents, final_cents, status, paid_at)  
         VALUES (?, ?, ?, ?, ?, ?, ?, 'paid', NOW())`,  
        [tid, venueId, playerId, orderNo, amountCents, totalDiscount, finalAmount]);  
    
      // 6. Give points + update level  
      if (playerId) {  
        const pointsToAdd = Math.floor(finalAmount / 100);  
        if (pointsToAdd > 0) {  
          await conn.query('UPDATE players SET points=points+?, total_spent_cents=total_spent_cents+? WHERE id=? AND tenant_id=?',  
            [pointsToAdd, finalAmount, playerId, tid]);  
          await conn.query(  
            `INSERT INTO points_logs (player_id, tenant_id, points, description, type) VALUES (?, ?, ?, ?, 'consume')`,  
            [playerId, tid, pointsToAdd, `订单 ${orderNo} 消费 +${pointsToAdd}分`]);  
        }  
    
        // Auto-upgrade member level  
        const [[p]] = await conn.query('SELECT total_spent_cents FROM players WHERE id=?', [playerId]);  
        const spent = p?.total_spent_cents || 0;  
        let newLevel = 'bronze';  
        if (spent >= 1000000) newLevel = 'diamond';  
        else if (spent >= 500000) newLevel = 'platinum';  
        else if (spent >= 200000) newLevel = 'gold';  
        else if (spent >= 50000) newLevel = 'silver';  
    
        await conn.query('UPDATE players SET membershipLevel=? WHERE id=? AND membershipLevel!=?', [newLevel, playerId, newLevel]);  
      }  
    
      await conn.commit();  
      conn.release();  
      res.json({  
        ok: true,  
        order: { orderNo, amountCents, discountCents: totalDiscount, finalCents: finalAmount, memberDiscount, couponDiscount, pointsEarned: playerId ? Math.floor(finalAmount/100) : 0 }  
      });  
    } catch (e) {  
      await conn.rollback();  
      conn.release();  
      console.error('[ERROR] settle+order:', e);  
      sendError(res, 500, 'database_error', String(e.message));  
    }  
  });  
    
  app.post('/api/sessions/:id/game-records', requireAuth, async (req, res) => {
    sendError(res, 410, 'recording_moved_to_customer');
  });
    
  // =====================================================================  
  // Phase 2: 商业化闭环 API  
  // =====================================================================  
    
  // ---------- 会员管理 ----------
}
