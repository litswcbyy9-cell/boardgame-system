import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { StaffService } from './staff.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('员工')
@ApiBearerAuth()
@Controller('staff')
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Get()
  @ApiOperation({ summary: '搜索员工列表' })
  async search(@Query('q') q?: string, @Query('status') status?: string) {
    return this.staffService.search(q, status);
  }

  @Post()
  @Roles(UserRole.admin)
  @ApiOperation({ summary: '新增员工档案' })
  async create(@Body() body: any) {
    return this.staffService.create(body);
  }

  @Patch(':id')
  @Roles(UserRole.admin)
  @ApiOperation({ summary: '编辑员工档案' })
  async update(@Param('id') id: string, @Body() body: any) {
    return this.staffService.update(Number(id), body);
  }

  @Delete(':id')
  @Roles(UserRole.admin)
  @ApiOperation({ summary: '停用员工' })
  async disable(@Param('id') id: string) {
    return this.staffService.disable(Number(id));
  }

  @Post(':id/account')
  @Roles(UserRole.admin)
  @ApiOperation({ summary: '创建员工后台账号' })
  async createAccount(@Param('id') id: string, @Body() body: any) {
    return this.staffService.createAccount(Number(id), body);
  }
}
