import { NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { PrismaService } from '../../shared/prisma/prisma.service';
export declare class AuditMiddleware implements NestMiddleware {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    use(req: Request, res: Response, next: NextFunction): void;
}
