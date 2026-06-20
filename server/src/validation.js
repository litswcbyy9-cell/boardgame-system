import { z } from 'zod';

export const PASSWORD_MIN_LENGTH = 8;

export function strongPassword(password) {
  return String(password || '').length >= PASSWORD_MIN_LENGTH;
}

export const adminRegisterSchema = z.object({
  username: z.string().trim().toLowerCase().regex(/^[a-zA-Z0-9_]{3,32}$/),
  password: z.string().min(PASSWORD_MIN_LENGTH),
  displayName: z.string().trim().optional(),
});

export const publicRegisterSchema = z.object({
  displayName: z.string().trim().min(1),
  phone: z.string().trim().regex(/^[0-9+\-\s]{6,32}$/),
  password: z.string().min(PASSWORD_MIN_LENGTH),
});

export const adminLoginSchema = z.object({
  username: z.string().trim().toLowerCase().min(1),
  password: z.string().min(1),
});

export const publicLoginSchema = z.object({
  phone: z.string().trim().min(1),
  password: z.string().min(1),
});

export const staffMutationSchema = z.object({
  username: z.string().trim().min(3).max(32).optional(),
  displayName: z.string().trim().min(1).optional(),
  fullName: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  position: z.string().trim().optional(),
  role: z.enum(['admin', 'staff']).optional(),
  status: z.enum(['active', 'disabled']).optional(),
  password: z.string().min(PASSWORD_MIN_LENGTH).optional(),
});
