import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../src/security.js';
import { PASSWORD_MIN_LENGTH, strongPassword } from '../src/validation.js';

describe('password security', () => {
  it('requires new passwords to be at least 8 characters', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
    expect(strongPassword('1234567')).toBe(false);
    expect(strongPassword('12345678')).toBe(true);
  });

  it('verifies stored password hashes', async () => {
    const hash = await hashPassword('goodpass123');
    await expect(verifyPassword('goodpass123', hash)).resolves.toBe(true);
    await expect(verifyPassword('badpass123', hash)).resolves.toBe(false);
  });
});
