

export function registerStaffRoutes(app, ctx) {
  const { pool, sendError, requireAuth, requireTenantAdmin, hashPassword, strongPassword, tenantId } = ctx;

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
    if (!strongPassword(password)) return sendError(res, 400, 'weak_password');
    
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
      if (!strongPassword(password)) return sendError(res, 400, 'weak_password');
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
        if (!strongPassword(password)) return sendError(res, 400, 'password_too_short');
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
}
