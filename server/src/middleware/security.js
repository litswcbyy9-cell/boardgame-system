import rateLimit from 'express-rate-limit';
import helmet from 'helmet';

export function applySecurityMiddleware(app) {
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }));

  const authLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: 'rate_limited',
      message: '登录尝试过于频繁，请稍后再试',
      description: '登录尝试过于频繁，请稍后再试',
    },
  });

  const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: 'rate_limited',
      message: '注册尝试过于频繁，请稍后再试',
      description: '注册尝试过于频繁，请稍后再试',
    },
  });

  app.use(['/api/auth/login', '/api/public/auth/login'], authLimiter);
  app.use(['/api/auth/register', '/api/public/auth/register'], registerLimiter);
}
