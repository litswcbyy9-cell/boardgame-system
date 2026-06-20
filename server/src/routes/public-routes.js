

export function registerPublicRoutes(app, ctx) {
  const { pool } = ctx;

  app.get('/api/tables', async (_req, res) => {
    await runOperationalMaintenance({ silent: true });
    const [rows] = await pool.query(
      `SELECT f.table_id AS id, f.code, f.venue_id AS venueId, f.pos_x AS posX, f.pos_y AS posY, f.sort_order AS sortOrder,
              f.seat_capacity AS seatCapacity, f.area_type AS areaType, f.floor_photo_url AS floorPhotoUrl,
              f.status, f.current_reservation_id AS currentReservationId,  
              f.current_session_id AS currentSessionId,  
              r.player_id AS currentReservationPlayerId,  
              p.display_name AS currentReservationPlayerName,  
              p.phone AS currentReservationPlayerPhone,  
              r.guest_name AS currentReservationGuestName,  
              r.guest_phone AS currentReservationGuestPhone,  
              r.party_size AS currentReservationPartySize,  
              r.reserved_start AS currentReservationStart,  
              r.reserved_end AS currentReservationEnd,  
              r.status AS currentReservationStatus,  
              s.reservation_id AS currentSessionReservationId,  
              s.guest_name AS currentSessionGuestName,  
              s.guest_phone AS currentSessionGuestPhone,  
              s.party_size AS currentSessionPartySize,  
              s.started_at AS currentSessionStartedAt,
              sr.reserved_end AS currentSessionReservedEnd,
              sr.player_id AS currentSessionPlayerId,
              sp.display_name AS currentSessionPlayerName,
              sp.phone AS currentSessionPlayerPhone
       FROM v_table_status_floor f  
       LEFT JOIN reservations r ON r.id = f.current_reservation_id  
       LEFT JOIN players p ON p.id = r.player_id  
       LEFT JOIN play_sessions s ON s.id = f.current_session_id AND s.ended_at IS NULL  
       LEFT JOIN reservations sr ON sr.id = s.reservation_id  
       LEFT JOIN players sp ON sp.id = sr.player_id  
       ORDER BY f.sort_order`  
    );  
    res.json(rows);  
  });
  
  app.get('/api/players', async (_req, res) => {
    const [rows] = await pool.query(
      `SELECT id, member_no AS memberNo, display_name AS displayName, phone, avatar_url AS avatarUrl,
              balance_cents AS balanceCents, total_recharged_cents AS totalRechargedCents,
              total_spent_cents AS totalSpentCents, status
       FROM players
       WHERE status = 'active'
         AND member_no IS NOT NULL AND member_no <> ''
         AND phone IS NOT NULL AND phone <> ''
       ORDER BY id DESC
       LIMIT 10`
    );
    res.json(rows);
  });
  
  app.get('/api/leaderboard', async (req, res) => {  
    try {  
      const sortBy = req.query.sortBy === 'elo' ? 'elo' : 'winrate';  
      const orderClause =  
        sortBy === 'elo'  
          ? 'ps.elo_rating DESC, ps.wins DESC, ps.games DESC'  
          : '(CASE WHEN ps.games = 0 THEN 0 ELSE ps.wins / ps.games END) DESC, ps.wins DESC, ps.games DESC';  
      const [rows] = await pool.query(  
        `SELECT p.id AS playerId, p.display_name AS displayName, p.avatar_url AS avatarUrl,  
                ps.wins, ps.games, ps.losses, ps.elo_rating AS eloRating,  
                (CASE WHEN ps.games = 0 THEN 0 ELSE ROUND(ps.wins / ps.games, 4) END) AS winRate,  
                ps.last_win_at AS lastWinAt  
         FROM players p  
         INNER JOIN player_stats ps ON ps.player_id = p.id  
         ORDER BY ${orderClause}  
         LIMIT 50`  
      );  
      res.json(rows);  
    } catch (error) {  
      console.error('[ERROR] leaderboard:', error.message);  
      sendError(res, 500, 'database_error', error.message);  
    }  
  });  
    
  app.get('/api/venue', async (_req, res) => {  
    const [[row]] = await pool.query(  
      `SELECT id, name, address, logo_url AS logoUrl FROM venues ORDER BY id LIMIT 1`  
    );  
    res.json(row || null);  
  });
}
