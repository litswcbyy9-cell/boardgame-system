import { Injectable, UnauthorizedException, ConflictException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { ConfigService } from '../../config/config.service';
import { LoginDto, RegisterDto, LoginResponseDto } from './dto/auth.dto';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  async login(dto: LoginDto): Promise<LoginResponseDto> {
    const username = dto.username.trim().toLowerCase();
    const user = await this.prisma.appUser.findUnique({
      where: { username },
      include: { staff: true },
    });

    if (!user || user.status !== 'active') {
      throw new UnauthorizedException('账号或密码错误');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('账号或密码错误');
    }

    const token = this.generateToken(user.id);
    return {
      token,
      user: this.serializeUser(user),
    };
  }

  async register(dto: RegisterDto): Promise<LoginResponseDto> {
    if (!this.config.publicRegisterEnabled) {
      throw new ForbiddenException('公开注册已关闭，请由管理员在员工管理中创建账号');
    }

    const username = dto.username.trim().toLowerCase();
    const passwordHash = await bcrypt.hash(dto.password, 10);

    // 检查用户名唯一性
    const existing = await this.prisma.appUser.findUnique({ where: { username } });
    if (existing) throw new ConflictException('账号已存在，请换一个账号名');

    // 事务：创建员工档案 + 应用账号
    const result = await this.prisma.$transaction(async (tx) => {
      const tempNo = `TMP${Date.now()}${Math.floor(Math.random() * 1000)}`;
      const staff = await tx.staffProfile.create({
        data: {
          employeeNo: tempNo,
          fullName: dto.displayName || username,
          position: '店员',
          status: 'active',
          hiredAt: new Date(),
        },
      });

      const employeeNo = `ST${new Date().getFullYear()}${String(staff.id).padStart(5, '0')}`;
      await tx.staffProfile.update({
        where: { id: staff.id },
        data: { employeeNo },
      });

      const appUser = await tx.appUser.create({
        data: {
          staffId: staff.id,
          username,
          displayName: dto.displayName || username,
          passwordHash,
          role: 'staff',
        },
        include: { staff: true },
      });

      return appUser;
    });

    const token = this.generateToken(result.id);
    return { token, user: this.serializeUser(result) };
  }

  async getProfile(userId: number) {
    const user = await this.prisma.appUser.findUnique({
      where: { id: userId },
      include: { staff: true },
    });
    if (!user || user.status !== 'active') return null;
    return this.serializeUser(user);
  }

  async logout(tokenHash: string) {
    // Server-side session invalidation — optional (JWT is stateless)
    // Could blacklist the token in Redis for enterprise deployments
    return { ok: true };
  }

  private generateToken(userId: number): string {
    const payload = { sub: userId };
    return this.jwt.sign(payload);
  }

  private serializeUser(row: any) {
    return {
      id: row.id,
      username: row.username,
      displayName: row.displayName,
      role: row.role,
      staffId: row.staffId ?? null,
      employeeNo: row.staff?.employeeNo ?? null,
      staffName: row.staff?.fullName ?? null,
      staffPhone: row.staff?.phone ?? null,
      position: row.staff?.position ?? null,
    };
  }
}
