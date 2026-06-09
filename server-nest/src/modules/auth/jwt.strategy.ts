import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '../../config/config.service';
import { PrismaService } from '../../shared/prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.jwtSecret,
    });
  }

  async validate(payload: { sub: number }) {
    const user = await this.prisma.appUser.findUnique({
      where: { id: payload.sub },
      include: { staff: true },
    });
    if (!user || user.status !== 'active') {
      throw new UnauthorizedException('账号不存在或已停用');
    }
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      staffId: user.staffId,
      employeeNo: user.staff?.employeeNo || null,
      staffName: user.staff?.fullName || null,
      staffPhone: user.staff?.phone || null,
      position: user.staff?.position || null,
    };
  }
}
