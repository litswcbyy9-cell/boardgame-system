import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './db.js';
import { llmInfo } from './llm.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, '../../db/migrations');

async function expectedMigrationFiles() {
  try {
    const files = await readdir(migrationsDir);
    return files.filter((file) => file.endsWith('.sql')).sort();
  } catch {
    return [];
  }
}

export async function getMigrationStatus() {
  const files = await expectedMigrationFiles();
  const [[tableInfo]] = await pool.query(
    `SELECT COUNT(*) AS cnt
     FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = 'schema_migrations'`
  );
  const tableExists = Number(tableInfo?.cnt || 0) > 0;
  if (!tableExists) {
    return {
      tableExists: false,
      expected: files.length,
      applied: 0,
      pending: files,
      failed: [],
    };
  }

  const [rows] = await pool.query(
    `SELECT filename, checksum, success, applied_at AS appliedAt, error_message AS errorMessage
     FROM schema_migrations
     ORDER BY filename ASC, applied_at DESC`
  );
  const latestByFile = new Map();
  for (const row of rows) {
    if (!latestByFile.has(row.filename)) latestByFile.set(row.filename, row);
  }
  const applied = files.filter((file) => latestByFile.get(file)?.success === 1);
  const pending = files.filter((file) => latestByFile.get(file)?.success !== 1);
  const failed = rows.filter((row) => row.success !== 1);
  return {
    tableExists: true,
    expected: files.length,
    applied: applied.length,
    pending,
    failed,
    records: rows,
  };
}

export async function getHealthSnapshot() {
  const startedAt = Date.now();
  let db = false;
  let migrationStatus = null;
  try {
    await pool.query('SELECT 1');
    db = true;
    migrationStatus = await getMigrationStatus();
  } catch (error) {
    migrationStatus = { error: error.message };
  }
  const llm = llmInfo();
  const migrationsHealthy = Boolean(
    migrationStatus &&
    !migrationStatus.error &&
    migrationStatus.tableExists &&
    (migrationStatus.pending?.length || 0) === 0 &&
    (migrationStatus.failed?.length || 0) === 0
  );
  return {
    ok: db && migrationsHealthy,
    db,
    migrations: migrationStatus
      ? {
          tableExists: !!migrationStatus.tableExists,
          expected: migrationStatus.expected || 0,
          applied: migrationStatus.applied || 0,
          pending: migrationStatus.pending?.length || 0,
          failed: migrationStatus.failed?.length || 0,
          healthy: migrationsHealthy,
        }
      : null,
    ai: {
      configured: llm.configured,
      model: llm.model,
    },
    uptimeSec: Math.round(process.uptime()),
    checkedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
  };
}
