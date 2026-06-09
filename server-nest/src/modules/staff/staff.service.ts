import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class StaffService {
  constructor(private prisma: PrismaService) {}

  async search(q?: string, status?: string) {
    const where: string[] = [];
    const params: any[] = [];

    if (q) {
      where.push(`(sp.full_name LIKE ? OR sp.phone LIKE ? OR sp.employee_no LIKE ? OR au.username LIKE ?)`);
      params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
    }
    if (status === 'active' || status === 'disabled') {
      where.push(`sp.status = ?`);
      params.push(status);
    }

    return this.prisma.$queryRawUnsafe<any[]>(
      `SELECT sp.id, sp.employee_no AS employeeNo, sp.full_name AS fullName, sp.phone,
              sp.position, sp.status, sp.hired_at AS hiredAt, sp.created_at AS createdAt,
              au.id AS userId, au.username, au.role, au.status AS userStatus
       FROM staff_profiles sp
       LEFT JOIN app_users au ON au.staff_id = sp.id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY sp.status ASC, sp.id DESC
       LIMIT 300`,
      ...params,
    );
  }

  async create(dto: { fullName: string; phone?: string; position?: string; hiredAt?: string; employeeNo?: string }) {
    if (!dto.fullName?.trim()) throw new BadRequestException('员工姓名不能为空');

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

  async update(id: number, dto: { fullName?: string; phone?: string; position?: string; status?: string; hiredAt?: string; employeeNo?: string }) {
    const data: any = {};
    if (dto.fullName) data.fullName = dto.fullName.trim();
    if (dto.phone !== undefined) data.phone = dto.phone?.trim() || null;
    if (dto.position) data.position = dto.position;
    if (dto.status) data.status = dto.status;
    if (dto.hiredAt) data.hiredAt = new Date(dto.hiredAt);
    if (dto.employeeNo) data.employeeNo = dto.employeeNo;

    const result = await this.prisma.staffProfile.updateMany({
      where: { id },
      data,
    });

    if (result.count === 0) throw new NotFoundException('员工不存在');

    if (dto.status === 'disabled') {
      await this.prisma.appUser.updateMany({
        where: { staffId: id },
        data: { status: 'disabled' },
      });
    }

    return { ok: true };
  }

  async disable(id: number) {
    const result = await this.prisma.staffProfile.updateMany({
      where: { id },
      data: { status: 'disabled' },
    });
    if (result.count === 0) throw new NotFoundException('员工不存在');
    await this.prisma.appUser.updateMany({
      where: { staffId: id },
      data: { status: 'disabled' },
    });
    return { ok: true };
  }

  async createAccount(staffId: number, dto: { username: string; password: string; role: string }) {
    const staff = await this.prisma.staffProfile.findUnique({ where: { id: staffId } });
    if (!staff || staff.status !== 'active') throw new NotFoundException('员工不存在或已停用');

    const existing = await this.prisma.appUser.findFirst({
      where: { staffId },
    });
    if (existing) throw new ConflictException('该员工已经绑定后台账号');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    await this.prisma.appUser.create({
      data: {
        staffId,
        username: dto.username,
        displayName: staff.fullName,
        passwordHash,
        role: dto.role as any,
      },
    });

    return { ok: true };
  }
}
