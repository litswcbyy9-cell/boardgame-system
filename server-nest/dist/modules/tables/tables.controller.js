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
exports.TablesController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const tables_service_1 = require("./tables.service");
let TablesController = class TablesController {
    constructor(tablesService) {
        this.tablesService = tablesService;
    }
    async getFloor() {
        return this.tablesService.getFloorStatus();
    }
    async matchTables(partySize = '4', startAt, endAt) {
        const size = Math.max(1, Math.min(20, Number(partySize)));
        return this.tablesService.matchTables(size, startAt, endAt);
    }
};
exports.TablesController = TablesController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: '获取桌位平面图及实时状态' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], TablesController.prototype, "getFloor", null);
__decorate([
    (0, common_1.Get)('match'),
    (0, swagger_1.ApiOperation)({ summary: '按人数和时段匹配可用桌位' }),
    __param(0, (0, common_1.Query)('partySize')),
    __param(1, (0, common_1.Query)('startAt')),
    __param(2, (0, common_1.Query)('endAt')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], TablesController.prototype, "matchTables", null);
exports.TablesController = TablesController = __decorate([
    (0, swagger_1.ApiTags)('桌位'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('tables'),
    __metadata("design:paramtypes", [tables_service_1.TablesService])
], TablesController);
//# sourceMappingURL=tables.controller.js.map