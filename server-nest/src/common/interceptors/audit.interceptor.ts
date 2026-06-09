import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { PrismaService } from '../../shared/prisma/prisma.service';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const SENSITIVE_KEYS = new Set(['password', 'token', 'authorization', 'password_hash', 'passwordHash']);

function sanitizedPayload(value: any, depth = 0): any {
  if (value == null || depth > 4) return value == null ? null : '[truncated]';
  if (Array.isArray(value)) return value.slice(0, 30).map(item => sanitizedPayload(item, depth + 1));
  if (typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).slice(0, 80).map(([key, item]) => {
      if (SENSITIVE_KEYS.has(key) || /password|token|secret|credential/i.test(key)) {
        return [key, '[redacted]'];
      }
      return [key, sanitizedPayload(item, depth + 1)];
    }),
  );
}

function auditResourceType(path: string): string {
  const parts = path.split('/').filter(Boolean);
  if (parts[1] === 'public') return parts[2] || 'public';
  return parts[1] || 'unknown';
}

function auditResourceId(path: string): string | null {
  const parts = path.split('/').filter(Boolean).slice(2);
  return parts.find(part => /^\d+$/.test(part)) || null;
}

function clientIp(req: Request): string | null {
  const forwarded = String(req.get('x-forwarded-for') || '').split(',')[0].trim();
  return forwarded || req.ip || (req.socket as any)?.remoteAddress || null;
}

@Injectable()
export class AuditMiddleware implements NestMiddleware {
  private readonly logger = new Logger(AuditMiddleware.name);

  constructor(private readonly prisma: PrismaService) {}

  use(req: Request, res: Response, next: NextFunction) {
    if (!WRITE_METHODS.has(req.method)) return next();

    const apiPath = req.originalUrl?.split('?')[0] || '';
    if (!apiPath.startsWith('/api/') && !apiPath.startsWith('/api/v1/')) return next();

    const start = Date.now();
    res.on('finish', () => {
      if (res.statusCode < 200 || res.statusCode >= 400) return;
      const pathname = apiPath.replace(/^\/api\/v1(?=\/|$)/, '/api');
      const bodyStr = req.body && Object.keys(req.body).length > 0
        ? JSON.stringify(sanitizedPayload(req.body)) : null;

      this.prisma.auditLog.create({
        data: {
          userId: (req as any).user?.id || null,
          action: `${req.method} ${pathname}`,
          resourceType: auditResourceType(pathname),
          resourceId: auditResourceId(pathname),
          requestMethod: req.method,
          requestPath: pathname,
          statusCode: res.statusCode,
          ip: clientIp(req),
          userAgent: String(req.get('user-agent') || '').slice(0, 255) || null,
          requestBodyJson: bodyStr ? JSON.parse(bodyStr) : null,
        },
      }).catch(err => {
        this.logger.warn(`审计日志写入失败: ${err.message}`);
      });
    });
    next();
  }
}
