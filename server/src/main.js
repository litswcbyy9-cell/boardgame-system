import express from 'express';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { app } from './index.js';
import { PORT } from './config.js';
import { runOperationalMaintenance } from './services/reservations.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function installProcessGuards() {
  process.on('unhandledRejection', (reason) => {
    console.error('[FATAL] unhandledRejection:', reason instanceof Error ? reason.message : reason);
  });
  process.on('uncaughtException', (err) => {
    console.error('[FATAL] uncaughtException:', err.message);
  });
}

function serveWebAssets() {
  if (process.env.SERVE_WEB !== '1') return;
  const webDist = path.resolve(__dirname, '../../web/dist');
  app.use(express.static(webDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(webDist, 'index.html'));
  });
}

function startMaintenanceLoop() {
  void runOperationalMaintenance({ silent: true });
  setInterval(() => {
    void runOperationalMaintenance({ silent: true });
  }, 60_000).unref();
}

function handleServerError(err) {
  if (err.code === 'EADDRINUSE') {
    console.error(`[server] port ${PORT} is already in use. Close the old process or set PORT to another value.`);
  } else {
    console.error('[server] failed to start:', err);
  }
  process.exit(1);
}

export function main() {
  installProcessGuards();
  serveWebAssets();

  const server = app.listen(PORT, () => {
    console.log(`${process.env.SERVE_WEB === '1' ? 'App' : 'API'} http://localhost:${PORT}`);
    startMaintenanceLoop();
  });
  server.on('error', handleServerError);
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
