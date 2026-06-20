import dotenv from 'dotenv';

dotenv.config();

export const SESSION_DAYS = 7;
export const RESERVATION_GRACE_MINUTES = Math.max(
  1,
  Math.min(180, Number(process.env.RESERVATION_GRACE_MINUTES || 15))
);
export const PUBLIC_REGISTER_ENABLED = process.env.ALLOW_PUBLIC_REGISTER === '1';
export const PORT = Number(process.env.PORT || 9898);

export function corsOptions() {
  const originList = String(process.env.CORS_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (originList.length) return { origin: originList, credentials: true };
  if (process.env.NODE_ENV === 'production') return { origin: false };
  return {};
}
