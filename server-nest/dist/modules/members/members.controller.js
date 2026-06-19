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
exports.MembersController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const members_service_1 = require("./members.service");
const member_dto_1 = require("./dto/member.dto");
let MembersController = class MembersController {
    constructor(membersService) {
        this.membersService = membersService;
    }
    async search(q, status) {
        return this.membersService.search(q, status);
    }
    async create(dto) {
        const amountCents = Math.round(dto.initialBalanceYuan * 100);
        return this.membersService.create({ ...dto, initialBalanceCents: amountCents });
    }
    async getReservations(id) {
        return this.membersService.getReservations(Number(id));
    }
    async recharge(id, dto) {
        const amountCents = Math.round(dto.amountYuan * 100);
        return this.membersService.recharge(Number(id), amountCents);
    }
    async consume(id, dto) {
        const amountCents = Math.round(dto.amountYuan * 100);
        return this.membersService.consume(Number(id), amountCents);
    }
    async disable(id) {
        return this.membersService.disable(Number(id));
    }
};
exports.MembersController = MembersController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: '搜索会员列表' }),
    __param(0, (0, common_1.Query)('q')),
    __param(1, (0, common_1.Query)('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], MembersController.prototype, "search", null);
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: '新增会员' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [member_dto_1.CreateMemberDto]),
    __metadata("design:returntype", Promise)
], MembersController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(':id/reservations'),
    (0, swagger_1.ApiOperation)({ summary: '查看会员预约记录' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], MembersController.prototype, "getReservations", null);
__decorate([
    (0, common_1.Post)(':id/recharge'),
    (0, swagger_1.ApiOperation)({ summary: '会员充值' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, member_dto_1.AmountDto]),
    __metadata("design:returntype", Promise)
], MembersController.prototype, "recharge", null);
__decorate([
    (0, common_1.Post)(':id/consume'),
    (0, swagger_1.ApiOperation)({ summary: '会员扣费' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, member_dto_1.AmountDto]),
    __metadata("design:returntype", Promise)
], MembersController.prototype, "consume", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, swagger_1.ApiOperation)({ summary: '停用会员' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], MembersController.prototype, "disable", null);
exports.MembersController = MembersController = __decorate([
    (0, swagger_1.ApiTags)('会员'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('members'),
    __metadata("design:paramtypes", [members_service_1.MembersService])
], MembersController);
//# sourceMappingURL=members.controller.js.map