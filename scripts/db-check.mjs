import mysql from 'mysql2/promise';

const requiredTables = [
  'app_users',
  'auth_sessions',
  'audit_logs',
  'game_copies',
  'game_loans',
  'game_tables',
  'games',
  'players',
  'player_sessions',
  'reservations',
  'schema_migrations',
];

const requiredColumns = [
  ['app_users', 'role'],
  ['app_users', 'status'],
  ['players', 'password_hash'],
  ['players', 'member_no'],
  ['games', 'cover_image_url'],
  ['game_copies', 'status'],
  ['game_loans', 'status'],
];

const requiredViews = ['v_table_status_floor'];
const requiredProcedures = ['sp_reserve_table', 'sp_checkin_start_session', 'sp_end_session_settle'];

const config = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'boardgame',
  password: process.env.DB_PASSWORD || 'boardgame',
  database: process.env.DB_NAME || 'boardgame',
};

function fail(message) {
  console.error(`[db-check] ${message}`);
  process.exitCode = 1;
}

const conn = await mysql.createConnection(config);
try {
  const [tables] = await conn.query(
    `SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()`
  );
  const tableSet = new Set(tables.map((row) => row.name));
  for (const table of requiredTables) {
    if (!tableSet.has(table)) fail(`missing table: ${table}`);
  }

  for (const [table, column] of requiredColumns) {
    const [[row]] = await conn.query(
      `SELECT COUNT(*) AS cnt
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [table, column]
    );
    if (Number(row.cnt) === 0) fail(`missing column: ${table}.${column}`);
  }

  for (const view of requiredViews) {
    const [[row]] = await conn.query(
      `SELECT COUNT(*) AS cnt
       FROM information_schema.VIEWS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      [view]
    );
    if (Number(row.cnt) === 0) fail(`missing view: ${view}`);
  }

  for (const procedure of requiredProcedures) {
    const [[row]] = await conn.query(
      `SELECT COUNT(*) AS cnt
       FROM information_schema.ROUTINES
       WHERE ROUTINE_SCHEMA = DATABASE() AND ROUTINE_TYPE = 'PROCEDURE' AND ROUTINE_NAME = ?`,
      [procedure]
    );
    if (Number(row.cnt) === 0) fail(`missing procedure: ${procedure}`);
  }

  if (!process.exitCode) {
    console.log('[db-check] ok');
  }
} finally {
  await conn.end();
}
