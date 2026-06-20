import { logger } from '../logger.js';

const ROUTE_METHODS = ['get', 'post', 'put', 'patch', 'delete'];

function wrapHandler(handler) {
  if (typeof handler !== 'function' || handler.length === 4) return handler;
  return function wrappedAsyncHandler(req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

export function installAsyncRouteWrapper(app) {
  for (const method of ROUTE_METHODS) {
    const original = app[method].bind(app);
    app[method] = (path, ...handlers) => original(path, ...handlers.map(wrapHandler));
  }
}

export function errorHandler(err, req, res, _next) {
  logger.error({
    event: 'request_failed',
    requestId: req.requestId,
    method: req.method,
    path: req.originalUrl,
    message: err?.message || String(err),
    stack: process.env.NODE_ENV === 'production' ? undefined : err?.stack,
  }, 'request_failed');

  if (res.headersSent) return;
  res.status(500).json({
    error: 'internal_server_error',
    message: '服务器内部错误，请稍后重试或查看后端日志',
    requestId: req.requestId,
  });
}
