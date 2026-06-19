"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MarketingModule = void 0;
const common_1 = require("@nestjs/common");
const prisma_module_1 = require("../../shared/prisma/prisma.module");
const coupon_service_1 = require("./coupon.service");
const coupon_management_controller_1 = require("./coupon-management.controller");
let MarketingModule = class MarketingModule {
};
exports.MarketingModule = MarketingModule;
exports.MarketingModule = MarketingModule = __decorate([
    (0, common_1.Module)({
        imports: [prisma_module_1.PrismaModule],
        controllers: [coupon_management_controller_1.CouponManagementController],
        providers: [coupon_service_1.CouponService],
        exports: [coupon_service_1.CouponService],
    })
], MarketingModule);
//# sourceMappingURL=marketing.module.js.map