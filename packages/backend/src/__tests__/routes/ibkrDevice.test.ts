import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { errorHandler } from '../../middleware/errorHandler.js';
import { createTestApp } from '../helpers/createTestApp.js';

const mocks = vi.hoisted(() => ({
  enroll: vi.fn(),
  list: vi.fn(),
  revoke: vi.fn(),
  operate: vi.fn(),
}));
vi.mock('../../services/ibkrDeviceService.js', () => ({
  enrollIbkrDevice: mocks.enroll,
  listIbkrDevices: mocks.list,
  revokeIbkrDevice: mocks.revoke,
  ibkrDeviceRequest: mocks.operate,
}));
vi.mock('../../lib/logger.js', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
vi.mock('../../lib/sentry.js', () => ({ Sentry: { captureException: vi.fn() } }));
const { default: deviceRouter, ibkrDeviceOwnerRouter } = await import('../../routes/ibkrDevice.js');
const owner = createTestApp(ibkrDeviceOwnerRouter, '/api/v1/ibkr/devices');
const device = express();
device.use(express.json());
device.use('/api/v1/ibkr-device', deviceRouter);
device.use(errorHandler);

beforeEach(() => vi.clearAllMocks());
describe('owner IBKR device routes', () => {
  it('lists only the requested owned anchor and passes the signed-in owner', async () => {
    mocks.list.mockResolvedValue([{ deviceId: 'public-id', cashPositionId: 'owned-cash' }]);
    expect(
      (await request(owner).get('/api/v1/ibkr/devices?cashPositionId=owned-cash')).status
    ).toBe(200);
    expect(mocks.list).toHaveBeenCalledWith('test-user-id', 'owned-cash');
  });
  it("lists the session owner's active grants without requiring a current cash anchor", async () => {
    const grants = [{ deviceId: 'public-id', cashPositionId: 'previously-owned-cash' }];
    mocks.list.mockResolvedValue(grants);
    const response = await request(owner).get('/api/v1/ibkr/devices');
    expect(response.status).toBe(200);
    expect(response.body).toEqual(grants);
    expect(mocks.list).toHaveBeenCalledWith('test-user-id', undefined);
  });
  it('rejects repeated, empty or client-supplied owner query values', async () => {
    expect(
      (await request(owner).get('/api/v1/ibkr/devices?cashPositionId=a&cashPositionId=b')).status
    ).toBe(400);
    expect((await request(owner).get('/api/v1/ibkr/devices?cashPositionId=')).status).toBe(400);
    expect((await request(owner).get('/api/v1/ibkr/devices?userId=another-owner')).status).toBe(
      400
    );
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it('does not accept client-supplied owner or permission fields', async () => {
    const response = await request(owner).post('/api/v1/ibkr/devices').send({
      cashPositionId: 'owned-cash',
      enrollment: {},
      userId: 'another-owner',
    });
    expect(response.status).toBe(400);
    expect(mocks.enroll).not.toHaveBeenCalled();
  });
  it('forwards the signed enrollment anchor unchanged under the session owner', async () => {
    const enrollment = {
      deviceId: '2927c799-4158-41f3-a7b9-8889794a05e0',
      cashPositionId: 'owned-cash',
      signature: 'public-enrollment-signature',
    };
    mocks.enroll.mockResolvedValue({ deviceId: enrollment.deviceId });
    const response = await request(owner)
      .post('/api/v1/ibkr/devices')
      .send({ cashPositionId: 'owned-cash', enrollment });
    expect(response.status).toBe(201);
    expect(mocks.enroll).toHaveBeenCalledWith('test-user-id', 'owned-cash', enrollment);
  });
  it('revokes only under the session owner', async () => {
    const id = '2927c799-4158-41f3-a7b9-8889794a05e0';
    mocks.revoke.mockResolvedValue({ deviceId: id, revokedAt: new Date().toISOString() });
    expect((await request(owner).delete(`/api/v1/ibkr/devices/${id}`)).status).toBe(200);
    expect(mocks.revoke).toHaveBeenCalledWith('test-user-id', id);
  });
});
describe('dedicated signed IBKR routes', () => {
  it('preserves the exact signed target including query text for signature rejection', async () => {
    mocks.operate.mockResolvedValue({ blocked: false });
    expect(
      (await request(device).post('/api/v1/ibkr-device/status?injected=true').send({})).status
    ).toBe(200);
    expect(mocks.operate.mock.calls[0][0]).toMatchObject({
      method: 'POST',
      path: '/api/v1/ibkr-device/status?injected=true',
      body: {},
    });
  });
  it('has no manual cash, restore, generic write or GET entry point', async () => {
    for (const route of ['restore', 'cash', 'positions'])
      expect((await request(device).post(`/api/v1/ibkr-device/${route}`).send({})).status).toBe(
        404
      );
    expect((await request(device).get('/api/v1/ibkr-device/status')).status).toBe(404);
    expect(mocks.operate).not.toHaveBeenCalled();
  });
});
