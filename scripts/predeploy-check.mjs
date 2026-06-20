import { existsSync, readFileSync } from 'node:fs';

const requiredFiles = [
  'deploy/docker-compose.prod.yml',
  'deploy/Dockerfile.api',
  'deploy/Dockerfile.web',
  'deploy/Caddyfile',
  'web/dist/index.html',
];

for (const file of requiredFiles) {
  if (!existsSync(file)) {
    console.error(`[predeploy] missing ${file}`);
    process.exitCode = 1;
  }
}

if (existsSync('deploy/.env.prod')) {
  const env = readFileSync('deploy/.env.prod', 'utf8');
  for (const key of ['SITE_DOMAIN', 'MYSQL_ROOT_PASSWORD', 'MYSQL_PASSWORD']) {
    if (!new RegExp(`^${key}=.+`, 'm').test(env)) {
      console.error(`[predeploy] missing ${key} in deploy/.env.prod`);
      process.exitCode = 1;
    }
  }
} else {
  console.warn('[predeploy] deploy/.env.prod not found; create it on the server before deployment');
}

if (!process.exitCode) {
  console.log('[predeploy] ok');
}
