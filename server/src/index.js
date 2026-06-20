import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditSuccessfulWrites } from './audit.js';
import {
  attachAuth,
  playerFromRequest,
  requireAuth,
  requirePlayerAuth,
  requireTenantAdmin,
  tenantId,
} from './auth.js';
import { corsOptions, PORT } from './config.js';
import { pool } from './db.js';
import { reservationErrorMessage, sendError } from './errors.js';
import { logger } from './logger.js';
import { callLLM, llmInfo } from './llm.js';
import { errorHandler, installAsyncRouteWrapper } from './middleware/errors.js';
import { applySecurityMiddleware } from './middleware/security.js';
import {
  callCancelReservation,
  callCheckin,
  callReserve,
  callSettle,
  callWalkin,
  recommendTableForReservation,
  runOperationalMaintenance,
} from './services/reservations.js';
import { sanitizeAiReply } from './services/ai-policy.js';
import { registerAuthRoutes } from './routes/auth-routes.js';
import { registerOpsRoutes } from './routes/ops-routes.js';
import { registerAiRoutes } from './routes/ai-routes.js';
import { registerGamesRoutes } from './routes/games-routes.js';
import { registerMembersRoutes } from './routes/members-routes.js';
import { registerPublicRoutes } from './routes/public-routes.js';
import { registerRentalRoutes } from './routes/rental-routes.js';
import { registerReportsRoutes } from './routes/reports-routes.js';
import { registerReservationRoutes } from './routes/reservation-routes.js';
import { registerStaffRoutes } from './routes/staff-routes.js';
import { registerTenantRoutes } from './routes/tenant-routes.js';
import { hashPassword } from './security.js';
import { strongPassword } from './validation.js';

process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] unhandledRejection:', reason instanceof Error ? reason.message : reason);
});
process.on('uncaughtException', (err) => {
  console.error('[FATAL] uncaughtException:', err.message);
});

export const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 中间件
app.disable('x-powered-by');
app.set('trust proxy', 1);
applySecurityMiddleware(app);
app.use(cors(corsOptions()));
app.use((req, res, next) => {
  req.requestId = crypto.randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});
app.use(express.json());
installAsyncRouteWrapper(app);

// API 版本前缀兼容：/api/v1/* → /api/* 内部路径
// 必须在 attachAuth / 路由处理之前执行，确保下游中间件看到统一路径
app.use((req, _res, next) => {
  if (req.url === '/api/v1' || req.url.startsWith('/api/v1/')) {
    req.url = req.url.replace(/^\/api\/v1(?=\/|$)/, '/api');
  }
  next();
});

// 请求日志中间件
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info({
      level: 'info',
      event: 'http_request',
      at: new Date().toISOString(),
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: duration,
    }, 'http_request');
  });
  next();
});

app.use(attachAuth);
app.use(auditSuccessfulWrites);
const routeContext = {
  pool,
  sendError,
  reservationErrorMessage,
  requireAuth,
  requirePlayerAuth,
  requireTenantAdmin,
  playerFromRequest,
  tenantId,
  hashPassword,
  strongPassword,
  callLLM,
  llmInfo,
  sanitizeAiReply,
  callCancelReservation,
  callCheckin,
  callReserve,
  callSettle,
  callWalkin,
  recommendTableForReservation,
  runOperationalMaintenance,
};

registerAuthRoutes(app);
registerOpsRoutes(app);
registerPublicRoutes(app, routeContext);
registerStaffRoutes(app, routeContext);
registerGamesRoutes(app, routeContext);
registerMembersRoutes(app, routeContext);
registerReportsRoutes(app, routeContext);
registerReservationRoutes(app, routeContext);
registerRentalRoutes(app, routeContext);
registerAiRoutes(app, routeContext);
registerTenantRoutes(app, routeContext);

app.use(errorHandler);

if (process.env.SERVE_WEB === '1') {
  const webDist = path.resolve(__dirname, '../../web/dist');
  app.use(express.static(webDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(webDist, 'index.html'));
  });
}

if (process.env.NODE_ENV !== 'test') {
  const server = app.listen(PORT, () => {
    console.log(`${process.env.SERVE_WEB === '1' ? 'App' : 'API'} http://localhost:${PORT}`);
    void runOperationalMaintenance({ silent: true });
    setInterval(() => {
      void runOperationalMaintenance({ silent: true });
    }, 60_000).unref();
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[server] port ${PORT} is already in use. Close the old process or set PORT to another value.`);
    } else {
      console.error('[server] failed to start:', err);
    }
    process.exit(1);
  });
}

export default app;
