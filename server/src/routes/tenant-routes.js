

export function registerTenantRoutes(app, ctx) {
  const { pool, sendError, requireAuth, tenantId } = ctx;

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
}
