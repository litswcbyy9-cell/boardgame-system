import { Controller, Get, Post, Body, Param, UseGuards, Request, Query, Inject } from '@nestjs/common';
import { MemberService } from './member.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('members-mgmt')
@UseGuards(JwtAuthGuard)
export class MemberManagementController {
  constructor(
    private memberService: MemberService,
    private prisma: PrismaService,
  ) {}

  @Get('list')
  async listMembers(
    @Request() req,
    @Query('skip') skip: string = '0',
    @Query('take') take: string = '20',
  ) {
    const tenantId = req.tenant.id;
    const players = await this.prisma.player.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      skip: parseInt(skip),
      take: parseInt(take),
    });

    const total = await this.prisma.player.count({
      where: { tenantId },
    });

    return {
      data: players,
      pagination: { skip: parseInt(skip), take: parseInt(take), total },
    };
  }

  @Get('stats')
  async getMemberStats(@Request() req) {
    const tenantId = req.tenant.id;

    const players = await this.prisma.player.findMany({ where: { tenantId } });

    const stats = {
      totalMembers: players.length,
      byLevel: {
        bronze: players.filter(p => p.membershipLevel === 'bronze').length,
        silver: players.filter(p => p.membershipLevel === 'silver').length,
        gold: players.filter(p => p.membershipLevel === 'gold').length,
        platinum: players.filter(p => p.membershipLevel === 'platinum').length,
        diamond: players.filter(p => p.membershipLevel === 'diamond').length,
      },
      totalSpent: players.reduce((sum, p) => sum + p.totalSpentCents, 0),
      avgSpent: players.length > 0
        ? Math.floor(players.reduce((sum, p) => sum + p.totalSpentCents, 0) / players.length)
        : 0,
      totalPoints: players.reduce((sum, p) => sum + p.points, 0),
    };

    return stats;
  }

  @Get(':id')
  async getMemberInfo(@Request() req, @Param('id') playerId: string) {
    const tenantId = req.tenant.id;
    return this.memberService.getMemberInfo(tenantId, parseInt(playerId));
  }

  @Get(':id/points-history')
  async getPointsHistory(
    @Request() req,
    @Param('id') playerId: string,
    @Query('take') take: string = '20',
  ) {
    const tenantId = req.tenant.id;
    return this.memberService.getMemberPointsHistory(
      tenantId,
      parseInt(playerId),
      parseInt(take),
    );
  }
}
