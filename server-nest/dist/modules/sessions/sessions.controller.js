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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const sessions_service_1 = require("./sessions.service");
let SessionsController = class SessionsController {
    constructor(sessionsService) {
        this.sessionsService = sessionsService;
    }
    async findOpen() {
        return this.sessionsService.findOpen();
    }
    async walkin(body) {
        return this.sessionsService.walkin(body);
    }
    async settle(id, body) {
        return this.sessionsService.settle(Number(id), body.billedMinutes, body.amountCents, body.notes);
    }
    async addGameRecord(id, body) {
        return this.sessionsService.addGameRecord(Number(id), body);
    }
};
exports.SessionsController = SessionsController;
__decorate([
    (0, common_1.Get)('open'),
    (0, swagger_1.ApiOperation)({ summary: '获取所有进行中的对局' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SessionsController.prototype, "findOpen", null);
__decorate([
    (0, common_1.Post)('walkin'),
    (0, swagger_1.ApiOperation)({ summary: '现场开台' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SessionsController.prototype, "walkin", null);
__decorate([
    (0, common_1.Post)(':id/settle'),
    (0, swagger_1.ApiOperation)({ summary: '结算关台' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], SessionsController.prototype, "settle", null);
__decorate([
    (0, common_1.Post)(':id/game-records'),
    (0, swagger_1.ApiOperation)({ summary: '录入战绩' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], SessionsController.prototype, "addGameRecord", null);
exports.SessionsController = SessionsController = __decorate([
    (0, swagger_1.ApiTags)('开台对局'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('sessions'),
    __metadata("design:paramtypes", [sessions_service_1.SessionsService])
], SessionsController);
//# sourceMappingURL=sessions.controller.js.map