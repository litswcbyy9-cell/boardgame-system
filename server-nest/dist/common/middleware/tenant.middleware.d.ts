import { NestMiddleware } from '@nestjs/common';
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
export declare class TenantMiddleware implements NestMiddleware {
    private jwtService;
    constructor(jwtService: JwtService);
    use(req: Request, res: Response, next: NextFunction): void;
    private extractToken;
}
