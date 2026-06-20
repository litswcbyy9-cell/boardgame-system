import { RESERVATION_GRACE_MINUTES } from '../config.js';
import { pool } from '../db.js';

let expiringReservations = false;

export async function callReserve(tableId, playerId, guestName, guestPhone, partySize, reservedStart, reservedEnd) {
  const conn = await pool.getConnection();
  try {
    await conn.query(
      'CALL sp_reserve_table(?, ?, ?, ?, ?, ?, ?, @out_rid, @out_err)',
      [tableId, playerId, guestName, guestPhone, partySize, reservedStart, reservedEnd]
    );
    const [[row]] = await conn.query('SELECT @out_rid AS reservationId, @out_err AS errCode');
    return row;
  } finally {
    conn.release();
  }
}

export async function callCheckin(reservationId) {
  const conn = await pool.getConnection();
  try {
    await conn.query('CALL sp_checkin_start_session(?, @out_sid, @out_err)', [reservationId]);
    const [[row]] = await conn.query('SELECT @out_sid AS sessionId, @out_err AS errCode');
    return row;
  } finally {
    conn.release();
  }
}

export async function callWalkin(tableId, guestName, guestPhone, partySize) {
  const conn = await pool.getConnection();
  try {
    await conn.query('CALL sp_start_walkin_session(?, ?, ?, ?, @out_sid, @out_err)', [tableId, guestName, guestPhone, partySize]);
    const [[row]] = await conn.query('SELECT @out_sid AS sessionId, @out_err AS errCode');
    return row;
  } finally {
    conn.release();
  }
}

export async function expireOverdueReservations({ silent = false } = {}) {
  if (expiringReservations) return 0;
  expiringReservations = true;
  const conn = await pool.getConnection();
  try {
    await conn.query('CALL sp_expire_overdue_reservations(?, @out_expired_count)', [RESERVATION_GRACE_MINUTES]);
    const [[row]] = await conn.query('SELECT @out_expired_count AS expiredCount');
    const count = Number(row?.expiredCount || 0);
    if (count > 0) {
      console.log(`[INFO] expired ${count} overdue reservations after ${RESERVATION_GRACE_MINUTES} minute grace`);
    }
    return count;
  } catch (error) {
    if (!silent) throw error;
    console.error('[WARN] expire overdue reservations failed:', error.message);
    return 0;
  } finally {
    conn.release();
    expiringReservations = false;
  }
}

export async function getUpcomingSessionWarnings() {
  const [rows] = await pool.query(
    `SELECT s.id, t.code AS tableCode, r.reserved_end AS reservedEnd,
            COALESCE(p.display_name, s.guest_name, r.guest_name, '现场客人') AS guestName,
            TIMESTAMPDIFF(MINUTE, NOW(), r.reserved_end) AS minutesLeft
     FROM play_sessions s
     INNER JOIN reservations r ON r.id = s.reservation_id
     INNER JOIN game_tables t ON t.id = s.table_id
     LEFT JOIN players p ON p.id = r.player_id
     WHERE s.ended_at IS NULL
       AND r.status = 'active'
       AND r.reserved_end > NOW()
       AND r.reserved_end <= DATE_ADD(NOW(), INTERVAL 15 MINUTE)
     ORDER BY r.reserved_end ASC
     LIMIT 12`
  );
  return rows;
}

export async function getOverdueSessionWarnings() {
  const [rows] = await pool.query(
    `SELECT s.id, t.code AS tableCode, r.reserved_end AS reservedEnd,
            COALESCE(p.display_name, s.guest_name, r.guest_name, '现场客人') AS guestName,
            TIMESTAMPDIFF(MINUTE, r.reserved_end, NOW()) AS minutesOverdue
     FROM play_sessions s
     INNER JOIN reservations r ON r.id = s.reservation_id
     INNER JOIN game_tables t ON t.id = s.table_id
     LEFT JOIN players p ON p.id = r.player_id
     WHERE s.ended_at IS NULL
       AND r.status = 'active'
       AND r.reserved_end <= NOW()
     ORDER BY r.reserved_end ASC
     LIMIT 20`
  );
  return rows;
}

export async function runOperationalMaintenance({ silent = false } = {}) {
  const expiredReservations = await expireOverdueReservations({ silent });
  let dueSoonSessions = [];
  let overdueSessions = [];
  try {
    [dueSoonSessions, overdueSessions] = await Promise.all([
      getUpcomingSessionWarnings(),
      getOverdueSessionWarnings(),
    ]);
  } catch (error) {
    if (!silent) throw error;
    console.error('[WARN] session warnings failed:', error.message);
  }
  return {
    expiredReservations,
    autoClosedSessions: 0,
    dueSoonSessions,
    overdueSessions,
    overdueSessionCount: overdueSessions.length,
    reservationGraceMinutes: RESERVATION_GRACE_MINUTES,
    checkedAt: new Date().toISOString(),
  };
}

export async function callSettle(sessionId, billedMinutes, amountCents, notes) {
  const conn = await pool.getConnection();
  try {
    await conn.query('CALL sp_end_session_settle(?, ?, ?, ?, @out_err)', [
      sessionId,
      billedMinutes,
      amountCents,
      notes ?? null,
    ]);
    const [[row]] = await conn.query('SELECT @out_err AS errCode');
    return row;
  } finally {
    conn.release();
  }
}

export async function callCancelReservation(reservationId) {
  const conn = await pool.getConnection();
  try {
    await conn.query('CALL sp_cancel_reservation(?, @out_err)', [reservationId]);
    const [[row]] = await conn.query('SELECT @out_err AS errCode');
    return row;
  } finally {
    conn.release();
  }
}

export async function recommendTableForReservation(partySize, reservedStart, reservedEnd) {
  const [sets] = await pool.query('CALL sp_recommend_tables(?, ?, ?)', [partySize, reservedStart, reservedEnd]);
  const row = (sets[0] || [])[0];
  if (!row) return null;
  return {
    tableId: Number(row.table_id),
    code: row.code,
    seatCapacity: Number(row.seat_capacity),
    areaType: row.area_type,
  };
}
