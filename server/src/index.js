import express from 'express';
import cors from 'cors';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { callLLM, llmInfo } from './llm.js';

dotenv.config();

// 兜底：任何未捕获的异步错误只记录日志，绝不让整个进程崩溃（导致全站 502）
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] unhandledRejection:', reason instanceof Error ? reason.message : reason);
});
process.on('uncaughtException', (err) => {
  console.error('[FATAL] uncaughtException:', err.message);
});

const app = express();
const scryptAsync = promisify(crypto.scrypt);
const SESSION_DAYS = 7;
const RESERVATION_GRACE_MINUTES = Math.max(1, Math.min(180, Number(process.env.RESERVATION_GRACE_MINUTES || 15)));
const PUBLIC_REGISTER_ENABLED = process.env.ALLOW_PUBLIC_REGISTER === '1';
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const SENSITIVE_KEYS = new Set(['password', 'token', 'authorization', 'password_hash', 'passwordHash']);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
let expiringReservations = false;
let autoClosingSessions = false;

function corsOptions() {
  const originList = String(process.env.CORS_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (originList.length) return { origin: originList, credentials: true };
  if (process.env.NODE_ENV === 'production') return { origin: false };
  return {};
}

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

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'boardgame',
  password: process.env.DB_PASSWORD || 'boardgame',
  database: process.env.DB_NAME || 'boardgame',
  charset: 'utf8mb4',
  waitForConnections: true,
  connectionLimit: 10,
});

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = await scryptAsync(password, salt, 64);
  return `${salt}:${derived.toString('hex')}`;
}

async function verifyPassword(password, storedHash) {
  const [salt, hash] = String(storedHash || '').split(':');
  if (!salt || !hash) return false;
  const derived = await scryptAsync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return expected.length === derived.length && crypto.timingSafeEqual(expected, derived);
}

function authTokenFrom(req) {
  const header = req.get('authorization') || '';
  if (!header.startsWith('Bearer ')) return '';
  return header.slice(7).trim();
}

function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name ?? row.displayName,
    role: row.role,
    tenantId: row.tenant_id ?? row.tenantId ?? 1,
    staffId: row.staff_id ?? row.staffId ?? null,
    employeeNo: row.employee_no ?? row.employeeNo ?? null,
    staffName: row.full_name ?? row.staffName ?? null,
    staffPhone: row.staff_phone ?? row.staffPhone ?? null,
    position: row.position ?? null,
  };
}

async function createSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hashToken(token);
  await pool.query(
    'INSERT INTO auth_sessions (user_id, token_hash, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))',
    [userId, tokenHash, SESSION_DAYS]
  );
  return token;
}

async function attachAuth(req, _res, next) {
  const token = authTokenFrom(req);
  if (!token) return next();
  try {
    const [[row]] = await pool.query(
      `SELECT u.id, u.username, u.display_name, u.role, u.staff_id, u.tenant_id,
              sp.employee_no, sp.full_name, sp.phone AS staff_phone, sp.position
       FROM auth_sessions s
       INNER JOIN app_users u ON u.id = s.user_id
       LEFT JOIN staff_profiles sp ON sp.id = u.staff_id
       WHERE s.token_hash = ? AND s.expires_at > NOW() AND u.status = 'active'
       LIMIT 1`,
      [hashToken(token)]
    );
    req.user = publicUser(row);
  } catch (error) {
    console.error('[WARN] auth attach failed:', error);
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) {
    return sendError(res, 401, 'unauthorized');
  }
  next();
}

function requireTenantAdmin(req, res, next) {
  if (!req.user) return sendError(res, 401, 'unauthorized');
  if (req.user.role !== 'admin') return sendError(res, 403, 'forbidden');
  next();
}

// 获取当前请求的 tenant_id
function tenantId(req) {
  return req.user?.tenantId || 1;
}

app.use(attachAuth);
app.use(auditSuccessfulWrites);

async function callReserve(tableId, playerId, guestName, guestPhone, partySize, reservedStart, reservedEnd) {
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

async function callCheckin(reservationId) {
  const conn = await pool.getConnection();
  try {
    await conn.query('CALL sp_checkin_start_session(?, @out_sid, @out_err)', [reservationId]);
    const [[row]] = await conn.query('SELECT @out_sid AS sessionId, @out_err AS errCode');
    return row;
  } finally {
    conn.release();
  }
}

async function callWalkin(tableId, guestName, guestPhone, partySize) {
  const conn = await pool.getConnection();
  try {
    await conn.query('CALL sp_start_walkin_session(?, ?, ?, ?, @out_sid, @out_err)', [tableId, guestName, guestPhone, partySize]);
    const [[row]] = await conn.query('SELECT @out_sid AS sessionId, @out_err AS errCode');
    return row;
  } finally {
    conn.release();
  }
}

async function expireOverdueReservations({ silent = false } = {}) {
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

async function autoCloseOverdueSessions({ silent = false } = {}) {
  if (autoClosingSessions) return 0;
  autoClosingSessions = true;
  const conn = await pool.getConnection();
  try {
    await conn.query(
      `CREATE TEMPORARY TABLE IF NOT EXISTS tmp_auto_closed_sessions (
        session_id INT UNSIGNED NOT NULL,
        table_id INT UNSIGNED NOT NULL,
        PRIMARY KEY (session_id),
        KEY ix_tmp_auto_closed_table (table_id)
      ) ENGINE=MEMORY`
    );
    await conn.query('TRUNCATE TABLE tmp_auto_closed_sessions');
    await conn.query(
      `INSERT IGNORE INTO tmp_auto_closed_sessions (session_id, table_id)
       SELECT s.id, s.table_id
       FROM play_sessions s
       INNER JOIN reservations r ON r.id = s.reservation_id
       WHERE s.ended_at IS NULL
         AND r.status = 'active'
         AND r.reserved_end <= NOW()`
    );
    const [[countRow]] = await conn.query('SELECT COUNT(*) AS closedCount FROM tmp_auto_closed_sessions');
    const closedCount = Number(countRow?.closedCount || 0);
    if (closedCount > 0) {
      await conn.beginTransaction();
      await conn.query(
        `UPDATE play_sessions s
         INNER JOIN tmp_auto_closed_sessions tmp ON tmp.session_id = s.id
         SET
           s.ended_at = NOW(),
           s.billed_minutes = GREATEST(1, TIMESTAMPDIFF(MINUTE, s.started_at, NOW())),
           s.amount_cents = IFNULL(s.amount_cents, 0),
           s.notes = CASE
             WHEN s.notes IS NULL OR s.notes = '' THEN '[系统] 预约时间结束自动关台'
             WHEN s.notes LIKE '%[系统] 预约时间结束自动关台%' THEN s.notes
             ELSE CONCAT(s.notes, CHAR(10), '[系统] 预约时间结束自动关台')
           END`
      );
      await conn.query(
        `UPDATE reservations r
         INNER JOIN play_sessions s ON s.reservation_id = r.id
         INNER JOIN tmp_auto_closed_sessions tmp ON tmp.session_id = s.id
         SET r.status = 'completed'
         WHERE r.status = 'active'`
      );
      await conn.query(
        `UPDATE game_table_state gts
         INNER JOIN (SELECT DISTINCT table_id FROM tmp_auto_closed_sessions) affected ON affected.table_id = gts.table_id
         LEFT JOIN (
           SELECT id, table_id
           FROM (
             SELECT
               r.id,
               r.table_id,
               ROW_NUMBER() OVER (PARTITION BY r.table_id ORDER BY r.reserved_start ASC, r.id ASC) AS rn
             FROM reservations r
             WHERE r.status = 'pending'
           ) ranked
           WHERE rn = 1
         ) nxt ON nxt.table_id = gts.table_id
         SET
           gts.status = IF(nxt.id IS NULL, 'idle', 'reserved'),
           gts.current_session_id = NULL,
           gts.current_reservation_id = nxt.id`
      );
      await conn.commit();
      console.log(`[INFO] auto-closed ${closedCount} sessions after reserved end`);
    }
    await conn.query('DROP TEMPORARY TABLE IF EXISTS tmp_auto_closed_sessions');
    return closedCount;
  } catch (error) {
    try { await conn.rollback(); } catch {}
    if (!silent) throw error;
    console.error('[WARN] auto-close overdue sessions failed:', error.message);
    return 0;
  } finally {
    conn.release();
    autoClosingSessions = false;
  }
}

async function getUpcomingSessionWarnings() {
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

async function runOperationalMaintenance({ silent = false } = {}) {
  const expiredReservations = await expireOverdueReservations({ silent });
  const autoClosedSessions = await autoCloseOverdueSessions({ silent });
  let dueSoonSessions = [];
  try {
    dueSoonSessions = await getUpcomingSessionWarnings();
  } catch (error) {
    if (!silent) throw error;
    console.error('[WARN] upcoming session warnings failed:', error.message);
  }
  return {
    expiredReservations,
    autoClosedSessions,
    dueSoonSessions,
    reservationGraceMinutes: RESERVATION_GRACE_MINUTES,
    checkedAt: new Date().toISOString(),
  };
}

async function callSettle(sessionId, billedMinutes, amountCents, notes) {
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

async function callGameRecord(sessionId, gameId, winnerPlayerId, winnerDisplayName, scoreJson) {
  const conn = await pool.getConnection();
  try {
    await conn.query('CALL sp_insert_game_record(?, ?, ?, ?, ?, @out_rid, @out_err)', [
      sessionId,
      gameId,
      winnerPlayerId ?? null,
      winnerDisplayName ?? null,
      scoreJson == null ? null : JSON.stringify(scoreJson),
    ]);
    const [[row]] = await conn.query('SELECT @out_rid AS recordId, @out_err AS errCode');
    return row;
  } finally {
    conn.release();
  }
}

// ELO 评分：胜者对每个败者两两计算，取平均增量。K=32，初始分 1200。
function eloExpected(a, b) {
  return 1 / (1 + Math.pow(10, (b - a) / 400));
}

// 根据名次列表计算每人 ELO 变化。participants: [{playerId, rating, rankNo}]
// 名次越小越靠前；同名次视为平局。返回 Map(playerId -> delta)
function calcEloDeltas(participants, k = 32) {
  const deltas = new Map();
  for (const p of participants) deltas.set(p.playerId, 0);
  for (let i = 0; i < participants.length; i++) {
    for (let j = i + 1; j < participants.length; j++) {
      const a = participants[i];
      const b = participants[j];
      // 实际得分：名次小者胜(1)，相同则平(0.5)
      let sa;
      if (a.rankNo < b.rankNo) sa = 1;
      else if (a.rankNo > b.rankNo) sa = 0;
      else sa = 0.5;
      const ea = eloExpected(a.rating, b.rating);
      const da = Math.round(k * (sa - ea));
      deltas.set(a.playerId, deltas.get(a.playerId) + da);
      deltas.set(b.playerId, deltas.get(b.playerId) - da);
    }
  }
  return deltas;
}

async function callCancelReservation(reservationId) {
  const conn = await pool.getConnection();
  try {
    await conn.query('CALL sp_cancel_reservation(?, @out_err)', [reservationId]);
    const [[row]] = await conn.query('SELECT @out_err AS errCode');
    return row;
  } finally {
    conn.release();
  }
}

function toPositiveInt(value, fallback, max) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(max, Math.round(n));
}

function toMysqlDatetime(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:00`;
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

const ERROR_MESSAGES = {
    invalid_username: '账号只能包含字母、数字和下划线，长度 3-32 位',
    weak_password: '密码至少 6 位',
    username_exists: '账号已存在，请换一个账号名',
    registration_disabled: '公开注册已关闭，请由管理员在员工管理中创建账号',
    invalid_credentials: '账号或密码错误',
    unauthorized: '请先登录后再操作',
    forbidden: '当前账号没有执行该操作的权限',
    database_error: '数据库操作失败，请检查数据库连接或稍后重试',
    llm_error: '大模型调用失败，请检查 API Key 配置或稍后重试',
    copy_not_available: '该副本当前不可借出',
    copy_not_found: '桌游副本不存在',
    copy_lent: '该副本正在借出中，不能删除',
    loan_not_found: '借出记录不存在',
    loan_not_active: '该借出记录不是借出中状态',
    missing_staff_name: '员工姓名不能为空',
    staff_not_found: '员工不存在或已停用',
    employee_no_exists: '员工号已存在',
    staff_has_account: '该员工已经绑定后台账号',
    account_exists: '账号已存在，请换一个账号名',
    invalid_member_id: '会员编号不合法',
    missing_display_name: '会员姓名不能为空',
    invalid_amount: '金额必须大于 0',
    member_not_found: '会员不存在或已停用',
    insufficient_balance: '会员不存在或余额不足',
    invalid_player_id: '会员 ID 不合法',
    invalid_time: '预约时间格式不合法',
    invalid_time_range: '结束时间必须晚于开始时间',
    missing_fields: '缺少必填字段，请补全后再提交',
    invalid_guest_name: '访客名称不能为空',
    invalid_party_size: '人数必须在 1 到 20 人之间',
    missing_tableId: '缺少桌位 ID',
    missing_gameId: '请选择要录入的桌游',
    table_not_found: '桌位不存在',
    table_occupied: '桌位正在占用中',
    time_overlap: '该时间段已有预约',
    capacity_exceeded: '预约人数超过该桌位容量，请选择更大桌位或包间',
    reserved_slot_active: '当前时间段已有待入场预约',
    no_table_available: '当前时间段没有容量合适的空闲桌位',
    reservation_not_found: '预约记录不存在',
    reservation_not_pending: '该预约不是待入场状态，不能入场',
    reservation_not_cancellable: '该预约已入场、取消或完成，不能再取消',
    session_not_open: '该对局不存在或已经结算，不能重复关台',
    session_still_open: '该对局仍在进行中，请先结算关台再录入战绩',
    game_not_found: '选择的桌游不存在',
};

function errorMessage(code, fallback = '操作失败，请检查输入后重试') {
  return ERROR_MESSAGES[code] || fallback;
}

function sendError(res, status, code, fallback) {
  const message = errorMessage(code, fallback);
  return res.status(status).json({ error: code, message, description: message });
}

function canonicalApiPath(req) {
  return String(req.originalUrl || req.url || '')
    .split('?')[0]
    .replace(/^\/api\/v1(?=\/|$)/, '/api');
}

function auditResourceType(pathname) {
  const parts = pathname.split('/').filter(Boolean);
  if (parts[1] === 'public') return parts[2] || 'public';
  return parts[1] || 'unknown';
}

function auditResourceId(pathname) {
  const parts = pathname.split('/').filter(Boolean).slice(2);
  return parts.find((part) => /^\d+$/.test(part)) || null;
}

function sanitizedPayload(value, depth = 0) {
  if (value == null || depth > 4) return value == null ? null : '[truncated]';
  if (Array.isArray(value)) return value.slice(0, 30).map((item) => sanitizedPayload(item, depth + 1));
  if (typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 80)
      .map(([key, item]) => {
        if (SENSITIVE_KEYS.has(key) || /password|token|secret|credential/i.test(key)) {
          return [key, '[redacted]'];
        }
        return [key, sanitizedPayload(item, depth + 1)];
      })
  );
}

function requestBodyJson(req) {
  if (!req.body || Object.keys(req.body).length === 0) return null;
  const json = JSON.stringify(sanitizedPayload(req.body));
  return json.length > 8000 ? JSON.stringify({ truncated: true }) : json;
}

function clientIp(req) {
  const forwarded = String(req.get('x-forwarded-for') || '').split(',')[0].trim();
  return forwarded || req.ip || req.socket?.remoteAddress || null;
}

async function writeAuditLog(req, res) {
  const pathname = canonicalApiPath(req);
  // TODO(多租户): tenant_id 目前为 NULL，多租户改造时从 req.tenant 或 JWT claim 中获取
  const tenantId = req.tenant?.id || null;
  await pool.query(
    `INSERT INTO audit_logs
      (tenant_id, user_id, action, resource_type, resource_id, request_method, request_path,
       status_code, ip, user_agent, request_body_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      tenantId,
      req.user?.id || null,
      `${req.method} ${pathname}`,
      auditResourceType(pathname),
      auditResourceId(pathname),
      req.method,
      pathname,
      res.statusCode,
      clientIp(req),
      String(req.get('user-agent') || '').slice(0, 255) || null,
      requestBodyJson(req),
    ]
  );
}

function auditSuccessfulWrites(req, res, next) {
  if (!WRITE_METHODS.has(req.method) || !canonicalApiPath(req).startsWith('/api/')) {
    return next();
  }
  res.on('finish', () => {
    if (res.statusCode >= 200 && res.statusCode < 400) {
      writeAuditLog(req, res).catch((error) => {
        console.error(JSON.stringify({
          level: 'warn',
          event: 'audit_log_failed',
          at: new Date().toISOString(),
          requestId: req.requestId,
          message: error.message,
        }));
      });
    }
  });
  next();
}

function reservationErrorMessage(code) {
  return errorMessage(code, '预约失败，请检查桌位、人数和时间后重试');
}

async function recommendTableForReservation(partySize, reservedStart, reservedEnd) {
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
     ORDER BY id LIMIT 800`
  );
  res.json(rows);
});

app.get('/api/members', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const status = String(req.query.status || 'all');
  const where = [];
  const params = [];
  let orderBy = 'status ASC, id DESC';

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
     LIMIT 300`,
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

  if (!normalizedName || !reservedStart || !reservedEnd) {
    return sendError(res, 400, 'missing_fields');
  }
  if (!Number.isFinite(normalizedPartySize) || normalizedPartySize < 1 || normalizedPartySize > 20) {
    return sendError(res, 400, 'invalid_party_size');
  }
  if (new Date(reservedStart) >= new Date(reservedEnd)) {
    return sendError(res, 400, 'invalid_time_range');
  }

  try {
    const pickedTable = tableId
      ? { tableId: Number(tableId), code: null, seatCapacity: null, areaType: null }
      : await recommendTableForReservation(normalizedPartySize, reservedStart, reservedEnd);

    if (!pickedTable) {
      return sendError(res, 409, 'no_table_available');
    }

    const row = await callReserve(
      pickedTable.tableId,
      null,
      normalizedName,
      normalizedPhone,
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
  const { gameId, winnerPlayerId, winnerDisplayName, scoreJson, participants } = req.body || {};
  if (!gameId) return sendError(res, 400, 'missing_gameId');

  // 解析参与者：[{playerId, rankNo, score}]。winner = rankNo 最小者（兜底用 winnerPlayerId）。
  const parts = Array.isArray(participants)
    ? participants
        .map((p) => ({
          playerId: Number(p.playerId),
          rankNo: Number(p.rankNo ?? p.rank ?? 0) || 999,
          score: p.score == null ? null : Number(p.score),
        }))
        .filter((p) => Number.isFinite(p.playerId) && p.playerId > 0)
    : [];

  // 确定胜者：优先显式 winnerPlayerId，否则取名次最小的参与者
  let effectiveWinnerId = winnerPlayerId == null ? null : Number(winnerPlayerId);
  if (effectiveWinnerId == null && parts.length) {
    const minRank = Math.min(...parts.map((p) => p.rankNo));
    const top = parts.filter((p) => p.rankNo === minRank);
    if (top.length === 1) effectiveWinnerId = top[0].playerId;
  }

  // 1) 写 game_records（沿用存储过程，触发器会给 winner 加 wins/games）
  const row = await callGameRecord(
    Number(req.params.id),
    Number(gameId),
    effectiveWinnerId,
    winnerDisplayName == null ? null : String(winnerDisplayName),
    scoreJson
  );
  if (row.errCode) return sendError(res, 409, row.errCode);
  const recordId = Number(row.recordId);

  // 2) 多人对局：写参与者明细 + 更新 ELO/losses/games
  let eloResult = [];
  if (parts.length >= 2) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      // 读各参与者当前 ELO（缺则建行）
      const ids = parts.map((p) => p.playerId);
      await conn.query(
        `INSERT IGNORE INTO player_stats (player_id, wins, games, elo_rating, losses)
         SELECT id, 0, 0, 1200, 0 FROM players WHERE id IN (${ids.map(() => '?').join(',')})`,
        ids
      );
      const [statRows] = await conn.query(
        `SELECT player_id, elo_rating FROM player_stats WHERE player_id IN (${ids.map(() => '?').join(',')})`,
        ids
      );
      const ratingMap = new Map(statRows.map((r) => [r.player_id, r.elo_rating]));
      const withRating = parts.map((p) => ({ ...p, rating: ratingMap.get(p.playerId) ?? 1200 }));
      const deltas = calcEloDeltas(withRating);
      const minRank = Math.min(...parts.map((p) => p.rankNo));

      for (const p of withRating) {
        const before = p.rating;
        const after = before + (deltas.get(p.playerId) || 0);
        const isWinner = p.rankNo === minRank ? 1 : 0;
        await conn.query(
          `INSERT INTO game_record_participants (record_id, player_id, is_winner, rank_no, score, elo_before, elo_after)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [recordId, p.playerId, isWinner, p.rankNo, p.score, before, after]
        );
        // 触发器已给 winner +1 wins/games；这里给非胜者补 games/losses，并给所有人更新 elo
        if (isWinner) {
          await conn.query('UPDATE player_stats SET elo_rating=? WHERE player_id=?', [after, p.playerId]);
        } else {
          await conn.query(
            'UPDATE player_stats SET elo_rating=?, games=games+1, losses=losses+1 WHERE player_id=?',
            [after, p.playerId]
          );
        }
        eloResult.push({ playerId: p.playerId, eloBefore: before, eloAfter: after, delta: after - before });
      }
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      console.error('[ERROR] elo update:', e);
    } finally {
      conn.release();
    }
  }

  res.status(201).json({ recordId, elo: eloResult });
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
    const skip = Number(req.query.skip)||0, take = Number(req.query.take)||20;
    const [rows] = await pool.query(
      `SELECT id, member_no AS memberNo, display_name AS displayName, phone,
              membershipLevel, points, total_spent_cents AS totalSpentCents,
              balance_cents AS balanceCents, created_at AS createdAt
       FROM players WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`,
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
    const start = new Date(startAt).toISOString().slice(0,19).replace('T',' ');
    const end = new Date(endAt).toISOString().slice(0,19).replace('T',' ');
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
        自动关台数: maintenance.autoClosedSessions,
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
      { role: 'system', content: '你是桌游馆常驻运营助手。根据提供的 JSON 数据用简洁中文回答店员的问题。经营类问题只依据数据回答、不编造数字；如果发现即将结束、逾期、自动关台、租借逾期等风险，要主动点出来并给出下一步操作。桌游推荐类问题（按人数/时长/难度/分类/偏好）从「桌游目录」里挑选最合适的 2-4 款并说明推荐理由。' },
      { role: 'user', content: `数据：\n${JSON.stringify(context, null, 2)}\n\n问题：${question}` },
    ], { temperature: 0.4, maxTokens: 2500 });
    res.json({ answer: content.trim(), data: context, mock });
  } catch (e) {
    console.error('[ERROR] ai ask:', e);
    sendError(res, 502, 'llm_error', String(e.message));
  }
});

// 顾客 AI 客服（公开端点）：只答桌游/预约相关，附带桌游目录
app.post('/api/public/ai/chat', async (req, res) => {
  const message = String(req.body?.message || '').trim();
  if (!message) return sendError(res, 400, 'missing_fields');
  try {
    const [games] = await pool.query(
      `SELECT title, category, min_players AS minP, max_players AS maxP, avg_minutes AS mins, difficulty_level AS diff
       FROM games ORDER BY recommend_weight DESC LIMIT 30`
    );
    const catalog = games.map((g) => `${g.title}（${g.category}，${g.minP}-${g.maxP}人，${g.mins}分钟，难度${g.diff}/5）`).join('；');
    const { content, mock } = await callLLM([
      { role: 'system', content: `你是桌游馆的友好客服。只回答桌游推荐、预约、营业相关问题，其他话题礼貌婉拒。店内桌游目录：${catalog}。根据顾客需求推荐合适桌游，简洁热情，控制在 120 字内。` },
      { role: 'user', content: message },
    ], { temperature: 0.7, maxTokens: 2000 });
    res.json({ reply: content.trim(), mock });
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

const port = Number(process.env.PORT || 9898);
const server = app.listen(port, () => {
  console.log(`${process.env.SERVE_WEB === '1' ? 'App' : 'API'} http://localhost:${port}`);
  void runOperationalMaintenance({ silent: true });
  setInterval(() => {
    void runOperationalMaintenance({ silent: true });
  }, 60_000).unref();
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
        `\n[server] 端口 ${port} 已被占用（常见：上次开的终端没关，或别的程序占用了该端口）。\n` +
        `解决办法二选一：\n` +
        `  1) 关掉所有正在跑 npm run dev 的黑窗口，再重新 npm run dev\n` +
        `  2) Windows 查占用：netstat -ano | findstr :${port}  （把 ${port} 换成当前端口）\n` +
        `     记下最后一列 PID，再执行：taskkill /PID 那一串数字 /F\n` +
        `  3) 或改端口：在 server/.env 里写 PORT=8788\n`
    );
  } else {
    console.error('[server] 启动失败:', err);
  }
  process.exit(1);
});
