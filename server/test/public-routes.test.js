import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { registerPublicRoutes } from '../src/routes/public-routes.js';

function createApp(ctx) {
  const app = express();
  registerPublicRoutes(app, ctx);
  return app;
}

describe('public routes', () => {
  it('loads table state after operational maintenance', async () => {
    const rows = [{ id: 1, code: 'A01', status: 'idle' }];
    const runOperationalMaintenance = vi.fn().mockResolvedValue({});
    const pool = {
      query: vi.fn().mockResolvedValue([rows]),
    };
    const app = createApp({
      pool,
      runOperationalMaintenance,
      sendError: vi.fn(),
    });

    const res = await request(app).get('/api/tables');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(rows);
    expect(runOperationalMaintenance).toHaveBeenCalledWith({ silent: true });
  });

  it('returns a controlled error when leaderboard query fails', async () => {
    const sendError = vi.fn((res, status, code, message) => res.status(status).json({ code, message }));
    const app = createApp({
      pool: {
        query: vi.fn().mockRejectedValue(new Error('bad column')),
      },
      runOperationalMaintenance: vi.fn(),
      sendError,
    });

    const res = await request(app).get('/api/leaderboard');

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ code: 'database_error', message: 'bad column' });
    expect(sendError).toHaveBeenCalled();
  });
});
