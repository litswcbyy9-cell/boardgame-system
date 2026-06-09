import { IsString, IsOptional, IsNumber, Min, MaxLength, IsPositive } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateMemberDto {
  @ApiProperty({ example: '小满' })
  @IsString()
  @MaxLength(100)
  displayName: string;

  @ApiProperty({ required: false, example: '13800010001' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @ApiProperty({ example: 100 })
  @IsNumber()
  @Min(0)
  initialBalanceYuan: number;
}

export class AmountDto {
  @ApiProperty({ example: 100 })
  @IsNumber()
  @IsPositive({ message: '金额必须大于 0' })
  amountYuan: number;
}

export class QueryMembersDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  status?: string;
}
