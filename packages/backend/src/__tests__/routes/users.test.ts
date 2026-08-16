import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createTestApp } from '../helpers/createTestApp.js';

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
}));

vi.mock('../../lib/prisma.js', () => ({
  prisma: {
    user: {
      findUnique: mocks.userFindUnique,
      update: mocks.userUpdate,
    },
  },
}));
vi.mock('../../lib/sentry.js', () => ({
  Sentry: { captureException: vi.fn() },
  initSentry: vi.fn(),
}));
vi.mock('../../lib/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { default: usersRouter } = await import('../../routes/users.js');
const app = createTestApp(usersRouter, '/api/users');

const PREFERENCE_SELECT = { snapshotHour: true, snapshotTimezone: true };

describe('users routes — snapshot preferences', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /me/preferences', () => {
    it('returns the caller’s stored preferences', async () => {
      mocks.userFindUnique.mockResolvedValue({ snapshotHour: 1, snapshotTimezone: 'Asia/Tokyo' });

      const response = await request(app).get('/api/users/me/preferences');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ snapshotHour: 1, snapshotTimezone: 'Asia/Tokyo' });
      expect(mocks.userFindUnique).toHaveBeenCalledWith({
        where: { id: 'test-user-id' },
        select: PREFERENCE_SELECT,
      });
    });

    it('sanitizes a corrupted stored timezone to the default instead of returning it raw', async () => {
      mocks.userFindUnique.mockResolvedValue({ snapshotHour: 5, snapshotTimezone: 'Mars/Olympus' });

      const response = await request(app).get('/api/users/me/preferences');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ snapshotHour: 5, snapshotTimezone: 'Asia/Singapore' });
    });

    it('404s when the user row is missing', async () => {
      mocks.userFindUnique.mockResolvedValue(null);

      const response = await request(app).get('/api/users/me/preferences');

      expect(response.status).toBe(404);
    });
  });

  describe('PATCH /me/preferences', () => {
    it('updates hour and timezone scoped to the caller only', async () => {
      mocks.userUpdate.mockResolvedValue({ snapshotHour: 1, snapshotTimezone: 'Asia/Singapore' });

      const response = await request(app)
        .patch('/api/users/me/preferences')
        .send({ snapshotHour: 1, snapshotTimezone: 'Asia/Singapore' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ snapshotHour: 1, snapshotTimezone: 'Asia/Singapore' });
      expect(mocks.userUpdate).toHaveBeenCalledWith({
        where: { id: 'test-user-id' },
        data: { snapshotHour: 1, snapshotTimezone: 'Asia/Singapore' },
        select: PREFERENCE_SELECT,
      });
    });

    it('accepts a partial update of just the hour', async () => {
      mocks.userUpdate.mockResolvedValue({ snapshotHour: 22, snapshotTimezone: 'Asia/Singapore' });

      const response = await request(app)
        .patch('/api/users/me/preferences')
        .send({ snapshotHour: 22 });

      expect(response.status).toBe(200);
      expect(mocks.userUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ data: { snapshotHour: 22 } })
      );
    });

    it.each([
      ['hour above 23', { snapshotHour: 24 }],
      ['negative hour', { snapshotHour: -1 }],
      ['fractional hour', { snapshotHour: 5.5 }],
      ['string hour', { snapshotHour: '5' }],
      ['unknown timezone', { snapshotTimezone: 'Mars/Olympus' }],
      ['abbreviation, not IANA', { snapshotTimezone: 'SGT' }],
      ['empty timezone', { snapshotTimezone: '' }],
      ['empty body', {}],
      ['unknown field', { snapshotHour: 5, foo: 'bar' }],
    ])('rejects %s with 400 and does not touch the database', async (_label, body) => {
      const response = await request(app).patch('/api/users/me/preferences').send(body);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation error');
      expect(mocks.userUpdate).not.toHaveBeenCalled();
    });
  });
});
