import { createWriteStream, mkdirSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';

const outDir = process.env.BACKUP_DIR || 'backups';
mkdirSync(outDir, { recursive: true });

const commit = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).stdout.trim() || 'nogit';
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const dbName = process.env.DB_NAME || 'boardgame';
const file = path.join(outDir, `${dbName}_${stamp}_${commit}.sql`);

const args = [
  `-h${process.env.DB_HOST || '127.0.0.1'}`,
  `-P${process.env.DB_PORT || '3306'}`,
  `-u${process.env.DB_USER || 'boardgame'}`,
  `-p${process.env.DB_PASSWORD || 'boardgame'}`,
  dbName,
];

const dump = spawn('mysqldump', args, { stdio: ['ignore', 'pipe', 'inherit'] });
dump.stdout.pipe(createWriteStream(file));
dump.on('exit', (code) => {
  if (code === 0) {
    console.log(`[db-backup] wrote ${file}`);
  } else {
    console.error(`[db-backup] mysqldump failed with code ${code}`);
    process.exit(code || 1);
  }
});
