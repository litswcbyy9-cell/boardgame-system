"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var AuditMiddleware_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditMiddleware = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../shared/prisma/prisma.service");
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const SENSITIVE_KEYS = new Set(['password', 'token', 'authorization', 'password_hash', 'passwordHash']);
function sanitizedPayload(value, depth = 0) {
    if (value == null || depth > 4)
        return value == null ? null : '[truncated]';
    if (Array.isArray(value))
        return value.slice(0, 30).map(item => sanitizedPayload(item, depth + 1));
    if (typeof value !== 'object')
        return value;
    return Object.fromEntries(Object.entries(value).slice(0, 80).map(([key, item]) => {
        if (SENSITIVE_KEYS.has(key) || /password|token|secret|credential/i.test(key)) {
            return [key, '[redacted]'];
        }
        return [key, sanitizedPayload(item, depth + 1)];
    }));
}
function auditResourceType(path) {
    const parts = path.split('/').filter(Boolean);
    if (parts[1] === 'public')
        return parts[2] || 'public';
    return parts[1] || 'unknown';
}
function auditResourceId(path) {
    const parts = path.split('/').filter(Boolean).slice(2);
    return parts.find(part => /^\d+$/.test(part)) || null;
}
function clientIp(req) {
    const forwarded = String(req.get('x-forwarded-for') || '').split(',')[0].trim();
    return forwarded || req.ip || req.socket?.remoteAddress || null;
}
let AuditMiddleware = AuditMiddleware_1 = class AuditMiddleware {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(AuditMiddleware_1.name);
    }
    use(req, res, next) {
        if (!WRITE_METHODS.has(req.method))
            return next();
        const apiPath = req.originalUrl?.split('?')[0] || '';
        if (!apiPath.startsWith('/api/') && !apiPath.startsWith('/api/v1/'))
            return next();
        const start = Date.now();
        res.on('finish', () => {
            if (res.statusCode < 200 || res.statusCode >= 400)
                return;
            const pathname = apiPath.replace(/^\/api\/v1(?=\/|$)/, '/api');
            const bodyStr = req.body && Object.keys(req.body).length > 0
                ? JSON.stringify(sanitizedPayload(req.body)) : null;
            this.prisma.auditLog.create({
                data: {
                    userId: req.user?.id || null,
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
};
exports.AuditMiddleware = AuditMiddleware;
exports.AuditMiddleware = AuditMiddleware = AuditMiddleware_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], AuditMiddleware);
//# sourceMappingURL=audit.interceptor.js.map