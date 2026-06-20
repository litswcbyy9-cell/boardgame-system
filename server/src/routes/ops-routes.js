import { pool } from '../db.js';
import { sendError } from '../errors.js';
import { getHealthSnapshot, getMigrationStatus } from '../ops.js';
import { requireAuth, requireTenantAdmin } from '../auth.js';
import { runOperationalMaintenance } from '../services/reservations.js';

export function registerOpsRoutes(app) {
  app.get('/api/health', async (_req, res) => {
    try {
      const health = await getHealthSnapshot();
      res.status(health.ok ? 200 : 503).json(health);
    } catch (e) {
      res.status(503).json({ ok: false, db: false, message: String(e.message) });
    }
  });

  app.get('/api/admin/migrations', requireTenantAdmin, async (_req, res) => {
    try {
      res.json(await getMigrationStatus());
    } catch (e) {
      console.error('[ERROR] GET /api/admin/migrations:', e);
      sendError(res, 500, 'database_error', String(e.message));
    }
  });

  app.get('/api/admin/audit-logs', requireTenantAdmin, async (req, res) => {
    try {
      const take = Math.min(200, Math.max(1, Number(req.query.limit || 100)));
      const [rows] = await pool.query(
        `SELECT a.id, a.user_id AS userId, u.username, a.action, a.resource_type AS resourceType,
                a.resource_id AS resourceId, a.request_method AS requestMethod,
                a.request_path AS requestPath, a.status_code AS statusCode,
                a.ip, a.user_agent AS userAgent, a.created_at AS createdAt
         FROM audit_logs a
         LEFT JOIN app_users u ON u.id = a.user_id
         ORDER BY a.created_at DESC
         LIMIT ?`,
        [take]
      );
      res.json({ data: rows });
    } catch (e) {
      console.error('[ERROR] GET /api/admin/audit-logs:', e);
      sendError(res, 500, 'database_error', String(e.message));
    }
  });

  app.post('/api/ops/maintenance', requireAuth, async (_req, res) => {
    const result = await runOperationalMaintenance({ silent: true });
    res.json(result);
  });
}
