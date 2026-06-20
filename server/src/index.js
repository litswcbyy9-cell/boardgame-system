import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditSuccessfulWrites } from './audit.js';
import {
  attachAuth,
  authTokenFrom,
  createPlayerSession,
  createSession,
  playerFromRequest,
  publicPlayer,
  publicUser,
  requireAuth,
  requirePlayerAuth,
  requireTenantAdmin,
  tenantId,
} from './auth.js';
import { corsOptions, PORT, PUBLIC_REGISTER_ENABLED, RESERVATION_GRACE_MINUTES } from './config.js';
import { pool } from './db.js';
import { reservationErrorMessage, sendError } from './errors.js';
import { callLLM, llmInfo } from './llm.js';
import {
  callCancelReservation,
  callCheckin,
  callReserve,
  callSettle,
  callWalkin,
  recommendTableForReservation,
  runOperationalMaintenance,
} from './services/reservations.js';
import { hashPassword, hashToken, verifyPassword } from './security.js';

process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] unhandledRejection:', reason instanceof Error ? reason.message : reason);
});
process.on('uncaughtException', (err) => {
  console.error('[FATAL] uncaughtException:', err.message);
});

export const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 中间件
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(cors(corsOptions()));
app.use((req, res, next) => {
  req.requestId = crypto.randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});
app.use(express.json());

// API 版本前缀兼容：/api/v1/* → /api/* 内部路径
// 必须在 attachAuth / 路由处理之前执行，确保下游中间件看到统一路径
app.use((req, _res, next) => {
  if (req.url === '/api/v1' || req.url.startsWith('/api/v1/')) {
    req.url = req.url.replace(/^\/api\/v1(?=\/|$)/, '/api');
  }
  next();
});

// 请求日志中间件
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(JSON.stringify({
      level: 'info',
      event: 'http_request',
      at: new Date().toISOString(),
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: duration,
    }));
  });
  next();
});

// 错误处理中间件
app.use((err, req, res, next) => {
  console.error('[ERROR]', err);
  res.status(500).json({
    error: 'internal_server_error',
    message: '服务器内部错误，请稍后重试或查看后端日志',
    description: err.message,
  });
});

app.use(attachAuth);
app.use(auditSuccessfulWrites);

function toPositiveInt(value, fallback, max) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(max, Math.round(n));
}

function toMysqlDatetime(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:00`;
}

function normalizeMysqlDatetimeInput(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const normalized = raw.replace('T', ' ');
  return normalized.length === 16 ? `${normalized}:00` : normalized.slice(0, 19);
}

function parseDateInput(value, fallback) {
  if (!value) return fallback;
  const normalized = String(value).trim().replace(' ', 'T');
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function buildGameReason(row, query) {
  const parts = [];
  const peopleScore = Number(row.people_score || 0);
  const durationScore = Number(row.duration_score || 0);
  const historyScore = Number(row.history_score || 0);
  const hotScore = Number(row.hot_score || 0);

  if (peopleScore >= 90) parts.push(`适合 ${query.partySize} 人`);
  else parts.push(`人数略有偏差但仍可安排`);
  if (durationScore >= 80) parts.push(`时长接近 ${query.minutes} 分钟`);
  if (query.category && row.category === query.category) parts.push(`匹配${row.category}偏好`);
  if (historyScore >= 90) parts.push('会员历史记录高度匹配');
  else if (historyScore >= 70) parts.push('会员曾偏好同类游戏');
  if (hotScore >= 50) parts.push('近期热度较高');
  if (!parts.length) parts.push('综合人数、时长和门店权重后排序靠前');
  return `${parts.join('，')}。`;
}

function buildTableReason(row, partySize) {
  const parts = [];
  const capacityScore = Number(row.capacity_score || 0);
  const availabilityScore = Number(row.availability_score || 0);
  const utilizationScore = Number(row.utilization_score || 0);

  if (capacityScore >= 90) parts.push(`容量适合 ${partySize} 人`);
  else parts.push(`容量可接待 ${partySize} 人但不是最优`);
  if (availabilityScore >= 95) parts.push('当前空闲');
  else parts.push('该时段无冲突预约');
  if (utilizationScore >= 80) parts.push('近期使用较均衡');
  return `${parts.join('，')}。`;
}

app.post('/api/auth/register', async (req, res) => {
  if (!PUBLIC_REGISTER_ENABLED) {
    return sendError(res, 403, 'registration_disabled');
  }

  const { username, password, displayName } = req.body || {};
  const normalizedUsername = String(username || '').trim().toLowerCase();
  const normalizedDisplayName = String(displayName || username || '').trim();

  if (!/^[a-zA-Z0-9_]{3,32}$/.test(normalizedUsername)) {
    return sendError(res, 400, 'invalid_username');
  }
  if (String(password || '').length < 6) {
    return sendError(res, 400, 'weak_password');
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const passwordHash = await hashPassword(String(password));
    const tempNo = `TMP${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const [staffResult] = await conn.query(
      `INSERT INTO staff_profiles (employee_no, full_name, position, status, hired_at)
       VALUES (?, ?, '店员', 'active', CURDATE())`,
      [tempNo, normalizedDisplayName || normalizedUsername]
    );
    const employeeNo = `ST${new Date().getFullYear()}${String(staffResult.insertId).padStart(5, '0')}`;
    await conn.query('UPDATE staff_profiles SET employee_no = ? WHERE id = ?', [employeeNo, staffResult.insertId]);
    const [result] = await conn.query(
      `INSERT INTO app_users (staff_id, username, display_name, password_hash, role)
       VALUES (?, ?, ?, ?, 'staff')`,
      [staffResult.insertId, normalizedUsername, normalizedDisplayName || normalizedUsername, passwordHash]
    );
    await conn.commit();
    const token = await createSession(result.insertId);
    const [[user]] = await pool.query(
      `SELECT u.id, u.username, u.display_name, u.role, u.staff_id,
              sp.employee_no, sp.full_name, sp.phone AS staff_phone, sp.position
       FROM app_users u
       LEFT JOIN staff_profiles sp ON sp.id = u.staff_id
       WHERE u.id = ?`,
      [result.insertId]
    );
    res.status(201).json({ token, user: publicUser(user) });
  } catch (error) {
    await conn.rollback();
    if (error && error.code === 'ER_DUP_ENTRY') {
      return sendError(res, 409, 'username_exists');
    }
    console.error('[ERROR] POST /api/auth/register:', error);
    sendError(res, 500, 'database_error', String(error.message));
  } finally {
    conn.release();
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  const normalizedUsername = String(username || '').trim().toLowerCase();
  const [[row]] = await pool.query(
    `SELECT u.id, u.username, u.display_name, u.password_hash, u.role, u.staff_id,
            sp.employee_no, sp.full_name, sp.phone AS staff_phone, sp.position
     FROM app_users u
     LEFT JOIN staff_profiles sp ON sp.id = u.staff_id
     WHERE u.username = ? AND u.status = 'active'
     LIMIT 1`,
    [normalizedUsername]
  );

  if (!row || !(await verifyPassword(String(password || ''), row.password_hash))) {
    return sendError(res, 401, 'invalid_credentials');
  }

  const token = await createSession(row.id);
  res.json({ token, user: publicUser(row) });
});

app.get('/api/auth/me', async (req, res) => {
  res.json({ user: req.user || null });
});

app.post('/api/auth/logout', requireAuth, async (req, res) => {
  const token = authTokenFrom(req);
  if (token) {
    await pool.query('DELETE FROM auth_sessions WHERE token_hash = ?', [hashToken(token)]);
  }
  res.json({ ok: true });
});

app.post('/api/public/auth/register', async (req, res) => {
  const displayName = String(req.body?.displayName || '').trim();
  const phone = String(req.body?.phone || '').trim();
  const password = String(req.body?.password || '');

  if (!displayName || !phone || !password) return sendError(res, 400, 'missing_fields');
  if (!/^[0-9+\-\s]{6,32}$/.test(phone)) return sendError(res, 400, 'invalid_phone');
  if (password.length < 6) return sendError(res, 400, 'weak_password');

  const conn = await pool.getConnection();
  let playerId = null;
  try {
    await conn.beginTransaction();
    const [[existing]] = await conn.query(
      `SELECT id, member_no, password_hash
       FROM players
       WHERE phone = ? AND status = 'active'
       ORDER BY id ASC
       LIMIT 1
       FOR UPDATE`,
      [phone]
    );
    if (existing?.password_hash) {
      await conn.rollback();
      return sendError(res, 409, 'phone_registered');
    }

    const passwordHash = await hashPassword(password);
    if (existing) {
      playerId = Number(existing.id);
      const memberNo = existing.member_no || `MB${new Date().getFullYear()}${String(playerId).padStart(5, '0')}`;
      await conn.query(
        `UPDATE players
         SET display_name = ?, password_hash = ?, member_no = COALESCE(member_no, ?), last_login_at = NOW()
         WHERE id = ?`,
        [displayName, passwordHash, memberNo, playerId]
      );
    } else {
      const [result] = await conn.query(
        `INSERT INTO players (display_name, phone, password_hash, last_login_at)
         VALUES (?, ?, ?, NOW())`,
        [displayName, phone, passwordHash]
      );
      playerId = Number(result.insertId);
      const memberNo = `MB${new Date().getFullYear()}${String(playerId).padStart(5, '0')}`;
      await conn.query('UPDATE players SET member_no = ? WHERE id = ?', [memberNo, playerId]);
    }
    await conn.commit();

    const token = await createPlayerSession(playerId);
    const [[player]] = await pool.query(
      'SELECT id, member_no, display_name, phone, avatar_url FROM players WHERE id = ?',
      [playerId]
    );
    res.status(201).json({ token, player: publicPlayer(player) });
  } catch (error) {
    try { await conn.rollback(); } catch {}
    console.error('[ERROR] POST /api/public/auth/register:', error);
    sendError(res, 500, 'database_error', String(error.message));
  } finally {
    conn.release();
  }
});

app.post('/api/public/auth/login', async (req, res) => {
  const phone = String(req.body?.phone || '').trim();
  const password = String(req.body?.password || '');
  const [[row]] = await pool.query(
    `SELECT id, member_no, display_name, phone, avatar_url, password_hash
     FROM players
     WHERE phone = ? AND status = 'active' AND password_hash IS NOT NULL
     ORDER BY id ASC
     LIMIT 1`,
    [phone]
  );

  if (!row || !(await verifyPassword(password, row.password_hash))) {
    return sendError(res, 401, 'invalid_credentials');
  }

  await pool.query('UPDATE players SET last_login_at = NOW() WHERE id = ?', [row.id]);
  const token = await createPlayerSession(row.id);
  res.json({ token, player: publicPlayer(row) });
});

app.get('/api/public/auth/me', async (req, res) => {
  const player = await playerFromRequest(req, { optional: true });
  res.json({ player });
});

app.post('/api/public/auth/logout', requirePlayerAuth, async (req, res) => {
  const token = authTokenFrom(req);
  if (token) {
    await pool.query('DELETE FROM player_sessions WHERE token_hash = ?', [hashToken(token)]);
  }
  res.json({ ok: true });
});

app.get('/api/staff', requireAuth, async (req, res) => {
  const q = String(req.query.q || '').trim();
  const status = String(req.query.status || 'all');
  const where = [];
  const params = [];

  if (q) {
    where.push('(sp.full_name LIKE ? OR sp.phone LIKE ? OR sp.employee_no LIKE ? OR au.username LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (status === 'active' || status === 'disabled') {
    where.push('sp.status = ?');
    params.push(status);
  }

  const [rows] = await pool.query(
    `SELECT sp.id, sp.employee_no AS employeeNo, sp.full_name AS fullName, sp.phone,
            sp.position, sp.status, sp.hired_at AS hiredAt, sp.created_at AS createdAt,
            au.id AS userId, au.username, au.role, au.status AS userStatus
     FROM staff_profiles sp
     LEFT JOIN app_users au ON au.staff_id = sp.id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY sp.status ASC, sp.id DESC
     LIMIT 300`,
    params
  );
  res.json(rows);
});

app.post('/api/staff', requireTenantAdmin, async (req, res) => {
  const fullName = String(req.body?.fullName || '').trim();
  const phone = req.body?.phone == null ? null : String(req.body.phone).trim() || null;
  const position = String(req.body?.position || '店员').trim() || '店员';
  const hiredAt = req.body?.hiredAt ? String(req.body.hiredAt).slice(0, 10) : null;
  const requestedNo = req.body?.employeeNo == null ? '' : String(req.body.employeeNo).trim();

  if (!fullName) return sendError(res, 400, 'missing_staff_name');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const tempNo = requestedNo || `TMP${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const [result] = await conn.query(
      `INSERT INTO staff_profiles (employee_no, full_name, phone, position, status, hired_at)
       VALUES (?, ?, ?, ?, 'active', ?)`,
      [tempNo, fullName, phone, position, hiredAt]
    );
    const employeeNo = requestedNo || `ST${new Date().getFullYear()}${String(result.insertId).padStart(5, '0')}`;
    if (!requestedNo) {
      await conn.query('UPDATE staff_profiles SET employee_no = ? WHERE id = ?', [employeeNo, result.insertId]);
    }
    await conn.commit();
    res.status(201).json({ id: result.insertId, employeeNo });
  } catch (error) {
    await conn.rollback();
    if (error && error.code === 'ER_DUP_ENTRY') return sendError(res, 409, 'employee_no_exists');
    console.error('[ERROR] POST /api/staff:', error);
    sendError(res, 500, 'database_error', String(error.message));
  } finally {
    conn.release();
  }
});

app.patch('/api/staff/:id', requireTenantAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const fullName = String(req.body?.fullName || '').trim();
  const phone = req.body?.phone == null ? null : String(req.body.phone).trim() || null;
  const position = String(req.body?.position || '店员').trim() || '店员';
  const status = String(req.body?.status || 'active');
  const hiredAt = req.body?.hiredAt ? String(req.body.hiredAt).slice(0, 10) : null;
  const employeeNo = req.body?.employeeNo == null ? null : String(req.body.employeeNo).trim() || null;

  if (!id) return sendError(res, 400, 'staff_not_found');
  if (!fullName) return sendError(res, 400, 'missing_staff_name');
  if (!['active', 'disabled'].includes(status)) return sendError(res, 400, 'staff_not_found');

  try {
    const [result] = await pool.query(
      `UPDATE staff_profiles
       SET employee_no = COALESCE(?, employee_no), full_name = ?, phone = ?, position = ?, status = ?, hired_at = ?
       WHERE id = ?`,
      [employeeNo, fullName, phone, position, status, hiredAt, id]
    );
    if (result.affectedRows === 0) return sendError(res, 404, 'staff_not_found');
    if (status === 'disabled') {
      await pool.query(`UPDATE app_users SET status = 'disabled' WHERE staff_id = ?`, [id]);
    }
    res.json({ ok: true });
  } catch (error) {
    if (error && error.code === 'ER_DUP_ENTRY') return sendError(res, 409, 'employee_no_exists');
    console.error('[ERROR] PATCH /api/staff/:id:', error);
    sendError(res, 500, 'database_error', String(error.message));
  }
});

app.delete('/api/staff/:id', requireTenantAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return sendError(res, 400, 'staff_not_found');
  const [result] = await pool.query(`UPDATE staff_profiles SET status = 'disabled' WHERE id = ?`, [id]);
  if (result.affectedRows === 0) return sendError(res, 404, 'staff_not_found');
  await pool.query(`UPDATE app_users SET status = 'disabled' WHERE staff_id = ?`, [id]);
  res.json({ ok: true });
});

app.post('/api/staff/:id/account', requireTenantAdmin, async (req, res) => {
  const staffId = Number(req.params.id);
  const username = String(req.body?.username || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const role = req.body?.role === 'admin' ? 'admin' : 'staff';

  if (!staffId) return sendError(res, 400, 'staff_not_found');
  if (!/^[a-zA-Z0-9_]{3,32}$/.test(username)) return sendError(res, 400, 'invalid_username');
  if (password.length < 6) return sendError(res, 400, 'weak_password');

  try {
    const [[staff]] = await pool.query(
      'SELECT id, full_name FROM staff_profiles WHERE id = ? AND status = "active"',
      [staffId]
    );
    if (!staff) return sendError(res, 404, 'staff_not_found');
    const [[existing]] = await pool.query('SELECT id FROM app_users WHERE staff_id = ?', [staffId]);
    if (existing) return sendError(res, 409, 'staff_has_account');

    const passwordHash = await hashPassword(password);
    const [result] = await pool.query(
      `INSERT INTO app_users (staff_id, username, display_name, password_hash, role)
       VALUES (?, ?, ?, ?, ?)`,
      [staffId, username, staff.full_name, passwordHash, role]
    );
    res.status(201).json({ id: result.insertId });
  } catch (error) {
    if (error && error.code === 'ER_DUP_ENTRY') return sendError(res, 409, 'account_exists');
    console.error('[ERROR] POST /api/staff/:id/account:', error);
    sendError(res, 500, 'database_error', String(error.message));
  }
});

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, db: true });
  } catch (e) {
    res.status(503).json({ ok: false, db: false, message: String(e.message) });
  }
});

app.post('/api/ops/maintenance', requireAuth, async (_req, res) => {
  const result = await runOperationalMaintenance({ silent: true });
  res.json(result);
});

/** 平面图：视图 v_table_status_floor */
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
app.get('/api/staff-mgmt/list', requireTenantAdmin, async (req, res) => {
  try {
    const tid = tenantId(req);
    const [rows] = await pool.query(
      `SELECT u.id, u.username, u.display_name AS displayName, u.role, u.status, u.created_at AS createdAt,
              sp.employee_no AS employeeNo, sp.full_name AS fullName, sp.phone, sp.position, sp.status AS staffStatus
       FROM app_users u
       LEFT JOIN staff_profiles sp ON sp.id = u.staff_id
       WHERE u.tenant_id = ?
       ORDER BY u.created_at DESC`, [tid]);
    res.json({ data: rows });
  } catch (e) { console.error(e); sendError(res, 500, 'db_error'); }
});

app.post('/api/staff-mgmt/create', requireTenantAdmin, async (req, res) => {
  try {
    const tid = tenantId(req);
    const { username, displayName, password, role, fullName, phone, position } = req.body||{};
    if (!username||!displayName||!password) return sendError(res, 400, 'missing');
    const normalizedRole = role === 'admin' ? 'admin' : 'staff';
    const passwordHash = await hashPassword(password);
    const [[existing]] = await pool.query('SELECT id FROM app_users WHERE tenant_id=? AND username=?', [tid, username]);
    if (existing) return sendError(res, 409, 'duplicate');

    const [staffR] = await pool.query(
      `INSERT INTO staff_profiles (employee_no, full_name, phone, position) VALUES (?,?,?,?)`,
      [`TMP${Date.now()}`, fullName||displayName, phone||null, position||'店员']);
    const staffId = staffR.insertId;
    const empNo = `ST${new Date().getFullYear()}${String(staffId).padStart(5,'0')}`;
    await pool.query('UPDATE staff_profiles SET employee_no=? WHERE id=?', [empNo, staffId]);

    const [userR] = await pool.query(
      `INSERT INTO app_users (tenant_id, staff_id, username, display_name, password_hash, role) VALUES (?,?,?,?,?,?)`,
      [tid, staffId, username, displayName, passwordHash, normalizedRole]);
    res.status(201).json({ id: userR.insertId, employeeNo: empNo });
  } catch (e) { console.error(e); sendError(res, 500, 'db_error'); }
});

app.patch('/api/staff-mgmt/:id', requireTenantAdmin, async (req, res) => {
  try {
    const tid = tenantId(req);
    const userId = Number(req.params.id);
    const { role, status, displayName, fullName, phone, position, password } = req.body||{};
    const [[target]] = await pool.query(
      `SELECT u.id, u.username, u.role, u.status, u.staff_id AS staffId
       FROM app_users u
       WHERE u.id=? AND u.tenant_id=?`,
      [userId, tid]
    );
    if (!target) return sendError(res, 404, 'not_found');

    const changingRoleOrStatus = role !== undefined || status !== undefined;
    if (changingRoleOrStatus && req.user && req.user.id === userId) {
      return sendError(res, 403, 'cannot_modify_self');
    }

    const nextRole = role === undefined ? target.role : (role === 'admin' ? 'admin' : 'staff');
    const nextStatus = status === undefined ? target.status : (status === 'disabled' ? 'disabled' : 'active');
    const willLoseActiveManager = target.role === 'admin' && (nextRole !== 'admin' || nextStatus !== 'active');
    if (willLoseActiveManager) {
      const [[{cnt}]] = await pool.query(
        `SELECT COUNT(*) as cnt FROM app_users WHERE tenant_id=? AND role='admin' AND status='active' AND id!=?`,
        [tid, userId]
      );
      if (cnt === 0) return sendError(res, 409, 'last_admin');
    }

    const updates = [], params = [];
    if (role !== undefined) { updates.push('role=?'); params.push(nextRole); }
    if (status !== undefined) { updates.push('status=?'); params.push(nextStatus); }
    if (displayName !== undefined) { updates.push('display_name=?'); params.push(String(displayName).trim() || target.username); }
    if (password !== undefined && String(password).trim()) {
      if (String(password).length < 6) return sendError(res, 400, 'password_too_short');
      updates.push('password_hash=?');
      params.push(await hashPassword(String(password)));
    }
    if (updates.length) {
      params.push(userId, tid);
      await pool.query(`UPDATE app_users SET ${updates.join(',')} WHERE id=? AND tenant_id=?`, params);
    }

    const staffUpdates = [], staffParams = [];
    if (fullName !== undefined) { staffUpdates.push('full_name=?'); staffParams.push(String(fullName).trim() || String(displayName || '').trim() || '未命名员工'); }
    if (phone !== undefined) { staffUpdates.push('phone=?'); staffParams.push(String(phone).trim() || null); }
    if (position !== undefined) { staffUpdates.push('position=?'); staffParams.push(String(position).trim() || '店员'); }
    if (status !== undefined) { staffUpdates.push('status=?'); staffParams.push(nextStatus); }
    if (staffUpdates.length && target.staffId) {
      staffParams.push(target.staffId);
      await pool.query(`UPDATE staff_profiles SET ${staffUpdates.join(',')} WHERE id=?`, staffParams);
    }

    if (!updates.length && !staffUpdates.length) return sendError(res, 400, 'no_fields');
    res.json({ ok: true });
  } catch (e) { console.error(e); sendError(res, 500, 'db_error'); }
});

// ---------- 桌游目录管理 ----------
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

app.post('/api/games-mgmt/create', requireAuth, async (req, res) => {
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

app.patch('/api/games-mgmt/:id', requireAuth, async (req, res) => {
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
app.post('/api/rental/copies', requireAuth, async (req, res) => {
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
app.patch('/api/rental/copies/:id', requireAuth, async (req, res) => {
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
app.get('/api/ai/info', requireAuth, (_req, res) => {
  res.json(llmInfo());
});

// 桌游描述生成：输入桌游名+参数，生成中文简介
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
    res.json({ answer: content.trim(), data: context, mock });
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
    res.json({ reply: content.trim(), mock, data: { tables } });
  } catch (e) {
    console.error('[ERROR] ai chat:', e);
    sendError(res, 502, 'llm_error', String(e.message));
  }
});

// ---------- 租户信息 ----------
app.get('/api/tenant/info', requireAuth, async (req, res) => {
  try {
    const tid = tenantId(req);
    const [[tenant]] = await pool.query('SELECT id, name, phone, planType, status, created_at AS createdAt FROM tenants WHERE id=?', [tid]);
    const [[venueCount]] = await pool.query('SELECT COUNT(*) as cnt FROM venues WHERE tenant_id=?', [tid]);
    const [[staffCount]] = await pool.query('SELECT COUNT(*) as cnt FROM app_users WHERE tenant_id=?', [tid]);
    const [[gameCount]] = await pool.query('SELECT COUNT(*) as cnt FROM games WHERE tenant_id=?', [tid]);
    res.json({ ...tenant, venueCount: venueCount.cnt, staffCount: staffCount.cnt, gameCount: gameCount.cnt });
  } catch (e) { console.error(e); sendError(res, 500, 'db_error'); }
});

if (process.env.SERVE_WEB === '1') {
  const webDist = path.resolve(__dirname, '../../web/dist');
  app.use(express.static(webDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(webDist, 'index.html'));
  });
}

const server = app.listen(PORT, () => {
  console.log(`${process.env.SERVE_WEB === '1' ? 'App' : 'API'} http://localhost:${PORT}`);
  void runOperationalMaintenance({ silent: true });
  setInterval(() => {
    void runOperationalMaintenance({ silent: true });
  }, 60_000).unref();
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[server] port ${PORT} is already in use. Close the old process or set PORT to another value.`);
  } else {
    console.error('[server] failed to start:', err);
  }
  process.exit(1);
});

export default app;
