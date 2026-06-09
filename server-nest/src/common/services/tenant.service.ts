import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';

@Injectable()
export class TenantService {
  constructor(private prisma: PrismaService) {}

  async createDefaultTenant() {
    const existing = await this.prisma.tenant.findUnique({
      where: { id: 1 },
    });

    if (existing) return existing;

    return this.prisma.tenant.create({
      data: {
        id: 1,
        name: 'Default Tenant',
        planType: 'free',
        status: 'active',
      },
    });
  }

  async getTenant(id: number) {
    return this.prisma.tenant.findUnique({
      where: { id },
    });
  }

  async createTenant(data: {
    name: string;
    phone?: string;
    planType?: 'free' | 'basic' | 'pro' | 'enterprise';
  }) {
    return this.prisma.tenant.create({
      data: {
        name: data.name,
        phone: data.phone,
        planType: data.planType || 'free',
        status: 'trial',
      },
    });
  }

  async updateTenantPlan(id: number, planType: string) {
    return this.prisma.tenant.update({
      where: { id },
      data: { planType: planType as any },
    });
  }
}
