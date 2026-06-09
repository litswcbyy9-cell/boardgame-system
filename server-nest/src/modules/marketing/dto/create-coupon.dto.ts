import { IsString, IsEnum, IsNumber, IsDateString, IsOptional } from 'class-validator';
import { CouponType } from '@prisma/client';

export class CreateCouponDto {
  @IsString()
  name: string;

  @IsEnum(CouponType)
  type: CouponType;

  @IsNumber()
  value: number;

  @IsNumber()
  @IsOptional()
  minAmount?: number;

  @IsNumber()
  totalQty: number;

  @IsDateString()
  startAt: string;

  @IsDateString()
  endAt: string;

  @IsString()
  @IsOptional()
  validOn?: 'weekday' | 'weekend' | 'all';
}
