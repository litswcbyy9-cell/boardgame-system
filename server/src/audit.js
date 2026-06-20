import { pool } from './db.js';
import { logger } from './logger.js';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const SENSITIVE_KEYS = new Set(['password', 'token', 'authorization', 'password_hash', 'passwordHash']);

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
  const tenantId = req.user?.tenantId || req.tenant?.id || 1;
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

export function auditSuccessfulWrites(req, res, next) {
  if (!WRITE_METHODS.has(req.method) || !canonicalApiPath(req).startsWith('/api/')) {
    return next();
  }
  res.on('finish', () => {
    if (res.statusCode >= 200 && res.statusCode < 400) {
      writeAuditLog(req, res).catch((error) => {
        logger.warn({
          level: 'warn',
          event: 'audit_log_failed',
          at: new Date().toISOString(),
          requestId: req.requestId,
          message: error.message,
        }, 'audit_log_failed');
      });
    }
  });
  next();
}
