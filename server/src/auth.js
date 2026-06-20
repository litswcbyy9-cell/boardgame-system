import crypto from 'node:crypto';
import { SESSION_DAYS } from './config.js';
import { pool } from './db.js';
import { sendError } from './errors.js';
import { hashToken } from './security.js';

export function authTokenFrom(req) {
  const header = req.get('authorization') || '';
  if (!header.startsWith('Bearer ')) return '';
  return header.slice(7).trim();
}

export function publicUser(row) {
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

export function publicPlayer(row) {
  if (!row) return null;
  return {
    id: row.id,
    memberNo: row.member_no ?? row.memberNo ?? null,
    displayName: row.display_name ?? row.displayName,
    phone: row.phone ?? null,
    avatarUrl: row.avatar_url ?? row.avatarUrl ?? null,
  };
}

export async function createSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hashToken(token);
  await pool.query(
    'INSERT INTO auth_sessions (user_id, token_hash, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))',
    [userId, tokenHash, SESSION_DAYS]
  );
  return token;
}

export async function createPlayerSession(playerId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hashToken(token);
  await pool.query(
    'INSERT INTO player_sessions (player_id, token_hash, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))',
    [playerId, tokenHash, SESSION_DAYS]
  );
  return token;
}

export async function playerFromRequest(req, { optional = false } = {}) {
  const token = authTokenFrom(req);
  if (!token) return null;
  try {
    const [[row]] = await pool.query(
      `SELECT p.id, p.member_no, p.display_name, p.phone, p.avatar_url
       FROM player_sessions s
       INNER JOIN players p ON p.id = s.player_id
       WHERE s.token_hash = ? AND s.expires_at > NOW() AND p.status = 'active'
       LIMIT 1`,
      [hashToken(token)]
    );
    return publicPlayer(row);
  } catch (error) {
    if (!optional) throw error;
    console.error('[WARN] player auth attach failed:', error.message);
    return null;
  }
}

export async function attachAuth(req, _res, next) {
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

export async function requirePlayerAuth(req, res, next) {
  try {
    req.player = await playerFromRequest(req);
    if (!req.player) return sendError(res, 401, 'unauthorized');
    return next();
  } catch (error) {
    console.error('[WARN] player auth failed:', error);
    return sendError(res, 401, 'unauthorized');
  }
}

export function requireAuth(req, res, next) {
  if (!req.user) {
    return sendError(res, 401, 'unauthorized');
  }
  next();
}

export function requireTenantAdmin(req, res, next) {
  if (!req.user) return sendError(res, 401, 'unauthorized');
  if (req.user.role !== 'admin') return sendError(res, 403, 'forbidden');
  next();
}

// 获取当前请求的 tenant_id
export function tenantId(req) {
  return req.user?.tenantId || 1;
}
