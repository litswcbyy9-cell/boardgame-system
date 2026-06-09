import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { JwtService } from '@nestjs/jwt';

export interface TenantContext {
  id: number;
  userId?: number;
}

declare global {
  namespace Express {
    interface Request {
      tenant?: TenantContext;
    }
  }
}

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private jwtService: JwtService) {}

  use(req: Request, res: Response, next: NextFunction) {
    const token = this.extractToken(req);
    if (!token) {
      // 如果没有 token，使用默认租户 ID 1
      req.tenant = { id: 1 };
      return next();
    }

    try {
      const payload = this.jwtService.verify(token);
      req.tenant = {
        id: payload.tenantId || 1,
        userId: payload.sub,
      };
    } catch (e) {
      // 若 token 无效，使用默认租户
      req.tenant = { id: 1 };
    }

    next();
  }

  private extractToken(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
