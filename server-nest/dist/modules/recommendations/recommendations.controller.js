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
exports.RecommendationsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const recommendations_service_1 = require("./recommendations.service");
let RecommendationsController = class RecommendationsController {
    constructor(recommendationsService) {
        this.recommendationsService = recommendationsService;
    }
    async recommendGames(playerId, partySize = '4', minutes = '120', category) {
        return this.recommendationsService.recommendGames({
            playerId: playerId ? Number(playerId) : null,
            partySize: Math.max(1, Math.min(20, Number(partySize))),
            minutes: Math.max(10, Math.min(600, Number(minutes))),
            category,
        });
    }
    async recommendTables(partySize = '4', startAt, endAt) {
        return this.recommendationsService.recommendTables(Math.max(1, Math.min(20, Number(partySize))), startAt, endAt);
    }
};
exports.RecommendationsController = RecommendationsController;
__decorate([
    (0, common_1.Get)('games'),
    (0, swagger_1.ApiOperation)({ summary: '智能推荐桌游（基于人数/时长/偏好/历史）' }),
    __param(0, (0, common_1.Query)('playerId')),
    __param(1, (0, common_1.Query)('partySize')),
    __param(2, (0, common_1.Query)('minutes')),
    __param(3, (0, common_1.Query)('category')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object, String]),
    __metadata("design:returntype", Promise)
], RecommendationsController.prototype, "recommendGames", null);
__decorate([
    (0, common_1.Get)('tables'),
    (0, swagger_1.ApiOperation)({ summary: '智能推荐桌位（按人数和时段）' }),
    __param(0, (0, common_1.Query)('partySize')),
    __param(1, (0, common_1.Query)('startAt')),
    __param(2, (0, common_1.Query)('endAt')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], RecommendationsController.prototype, "recommendTables", null);
exports.RecommendationsController = RecommendationsController = __decorate([
    (0, swagger_1.ApiTags)('智能推荐'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('recommendations'),
    __metadata("design:paramtypes", [recommendations_service_1.RecommendationsService])
], RecommendationsController);
//# sourceMappingURL=recommendations.controller.js.map