"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MembersModule = void 0;
const common_1 = require("@nestjs/common");
const prisma_module_1 = require("../../shared/prisma/prisma.module");
const members_controller_1 = require("./members.controller");
const member_management_controller_1 = require("./member-management.controller");
const members_service_1 = require("./members.service");
const member_service_1 = require("./member.service");
let MembersModule = class MembersModule {
};
exports.MembersModule = MembersModule;
exports.MembersModule = MembersModule = __decorate([
    (0, common_1.Module)({
        imports: [prisma_module_1.PrismaModule],
        controllers: [members_controller_1.MembersController, member_management_controller_1.MemberManagementController],
        providers: [members_service_1.MembersService, member_service_1.MemberService],
        exports: [members_service_1.MembersService, member_service_1.MemberService],
    })
], MembersModule);
//# sourceMappingURL=members.module.js.map