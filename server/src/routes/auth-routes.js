import { PUBLIC_REGISTER_ENABLED } from '../config.js';
import { pool } from '../db.js';
import { sendError } from '../errors.js';
import {
  authTokenFrom,
  createPlayerSession,
  createSession,
  playerFromRequest,
  publicPlayer,
  publicUser,
  requireAuth,
  requirePlayerAuth,
} from '../auth.js';
import { hashPassword, hashToken, verifyPassword } from '../security.js';
import {
  adminLoginSchema,
  adminRegisterSchema,
  publicLoginSchema,
  publicRegisterSchema,
} from '../validation.js';

function authValidationError(res, parsed, passwordCode = 'weak_password') {
  const fields = new Set(parsed.error.issues.map((issue) => issue.path[0]));
  if (fields.has('password')) return sendError(res, 400, passwordCode);
  if (fields.has('username')) return sendError(res, 400, 'invalid_username');
  if (fields.has('phone')) return sendError(res, 400, 'invalid_phone');
  return sendError(res, 400, 'missing_fields');
}

export function registerAuthRoutes(app) {
  app.post('/api/auth/register', async (req, res) => {
    if (!PUBLIC_REGISTER_ENABLED) {
      return sendError(res, 403, 'registration_disabled');
    }

    const parsed = adminRegisterSchema.safeParse(req.body || {});
    if (!parsed.success) return authValidationError(res, parsed);
    const { username: normalizedUsername, password, displayName } = parsed.data;
    const normalizedDisplayName = String(displayName || normalizedUsername).trim();

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
    const parsed = adminLoginSchema.safeParse(req.body || {});
    if (!parsed.success) return sendError(res, 401, 'invalid_credentials');
    const { username: normalizedUsername, password } = parsed.data;
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
    const parsed = publicRegisterSchema.safeParse(req.body || {});
    if (!parsed.success) return authValidationError(res, parsed);
    const { displayName, phone, password } = parsed.data;

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
    const parsed = publicLoginSchema.safeParse(req.body || {});
    if (!parsed.success) return sendError(res, 401, 'invalid_credentials');
    const { phone, password } = parsed.data;
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
}
