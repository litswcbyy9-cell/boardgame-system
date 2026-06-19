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
Object.defineProperty(exports, "__esModule", { value: true });
exports.StaffService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../shared/prisma/prisma.service");
const bcrypt = require("bcryptjs");
let StaffService = class StaffService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async search(q, status) {
        const where = [];
        const params = [];
        if (q) {
            where.push(`(sp.full_name LIKE ? OR sp.phone LIKE ? OR sp.employee_no LIKE ? OR au.username LIKE ?)`);
            params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
        }
        if (status === 'active' || status === 'disabled') {
            where.push(`sp.status = ?`);
            params.push(status);
        }
        return this.prisma.$queryRawUnsafe(`SELECT sp.id, sp.employee_no AS employeeNo, sp.full_name AS fullName, sp.phone,
              sp.position, sp.status, sp.hired_at AS hiredAt, sp.created_at AS createdAt,
              au.id AS userId, au.username, au.role, au.status AS userStatus
       FROM staff_profiles sp
       LEFT JOIN app_users au ON au.staff_id = sp.id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY sp.status ASC, sp.id DESC
       LIMIT 300`, ...params);
    }
    async create(dto) {
        if (!dto.fullName?.trim())
            throw new common_1.BadRequestException('员工姓名不能为空');
        const employeeNo = dto.employeeNo?.trim() || null;
        const tempNo = employeeNo || `TMP${Date.now()}${Math.floor(Math.random() * 1000)}`;
        const staff = await this.prisma.staffProfile.create({
            data: {
                employeeNo: tempNo,
                fullName: dto.fullName.trim(),
                phone: dto.phone || null,
                position: dto.position || '店员',
                hiredAt: dto.hiredAt ? new Date(dto.hiredAt) : null,
            },
        });
        const finalNo = employeeNo || `ST${new Date().getFullYear()}${String(staff.id).padStart(5, '0')}`;
        if (!employeeNo) {
            await this.prisma.staffProfile.update({
                where: { id: staff.id },
                data: { employeeNo: finalNo },
            });
        }
        return { id: staff.id, employeeNo: finalNo };
    }
    async update(id, dto) {
        const data = {};
        if (dto.fullName)
            data.fullName = dto.fullName.trim();
        if (dto.phone !== undefined)
            data.phone = dto.phone?.trim() || null;
        if (dto.position)
            data.position = dto.position;
        if (dto.status)
            data.status = dto.status;
        if (dto.hiredAt)
            data.hiredAt = new Date(dto.hiredAt);
        if (dto.employeeNo)
            data.employeeNo = dto.employeeNo;
        const result = await this.prisma.staffProfile.updateMany({
            where: { id },
            data,
        });
        if (result.count === 0)
            throw new common_1.NotFoundException('员工不存在');
        if (dto.status === 'disabled') {
            await this.prisma.appUser.updateMany({
                where: { staffId: id },
                data: { status: 'disabled' },
            });
        }
        return { ok: true };
    }
    async disable(id) {
        const result = await this.prisma.staffProfile.updateMany({
            where: { id },
            data: { status: 'disabled' },
        });
        if (result.count === 0)
            throw new common_1.NotFoundException('员工不存在');
        await this.prisma.appUser.updateMany({
            where: { staffId: id },
            data: { status: 'disabled' },
        });
        return { ok: true };
    }
    async createAccount(staffId, dto) {
        const staff = await this.prisma.staffProfile.findUnique({ where: { id: staffId } });
        if (!staff || staff.status !== 'active')
            throw new common_1.NotFoundException('员工不存在或已停用');
        const existing = await this.prisma.appUser.findFirst({
            where: { staffId },
        });
        if (existing)
            throw new common_1.ConflictException('该员工已经绑定后台账号');
        const passwordHash = await bcrypt.hash(dto.password, 10);
        await this.prisma.appUser.create({
            data: {
                staffId,
                username: dto.username,
                displayName: staff.fullName,
                passwordHash,
                role: dto.role,
            },
        });
        return { ok: true };
    }
};
exports.StaffService = StaffService;
exports.StaffService = StaffService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], StaffService);
//# sourceMappingURL=staff.service.js.map