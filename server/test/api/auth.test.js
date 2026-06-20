import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../../src/index.js';

describe('auth api smoke', () => {
  it('returns anonymous user when no bearer token is supplied', async () => {
    const res = await request(app).get('/api/auth/me').expect(200);
    expect(res.body).toEqual({ user: null });
  });
});
