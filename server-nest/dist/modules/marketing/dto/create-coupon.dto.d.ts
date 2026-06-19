import { CouponType } from '@prisma/client';
export declare class CreateCouponDto {
    name: string;
    type: CouponType;
    value: number;
    minAmount?: number;
    totalQty: number;
    startAt: string;
    endAt: string;
    validOn?: 'weekday' | 'weekend' | 'all';
}
