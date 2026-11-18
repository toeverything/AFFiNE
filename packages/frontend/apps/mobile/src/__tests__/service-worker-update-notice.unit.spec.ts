/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const notify = vi.fn();
vi.mock('@affine/component', () => ({ notify }));

const activateWaitingServiceWorker = vi.fn().mockResolvedValue(undefined);
const registerServiceWorker = vi.fn();
vi.mock('../register-service-worker', () => ({
  activateWaitingServiceWorker,
  registerServiceWorker,
}));

describe('registerServiceWorkerWithUpdateNotice', () => {
  beforeEach(() => {
    notify.mockClear();
    activateWaitingServiceWorker.mockClear();
    registerServiceWorker.mockClear();
  });

  it('registers with an onUpdateWaiting handler that shows a persistent banner', async () => {
    const { registerServiceWorkerWithUpdateNotice } = await import(
      '../service-worker-update-notice'
    );

    registerServiceWorkerWithUpdateNotice();

    expect(registerServiceWorker).toHaveBeenCalledTimes(1);
    const handlers = registerServiceWorker.mock.calls[0][0];
    expect(handlers.onUpdateWaiting).toBeInstanceOf(Function);

    const fakeRegistration = {};
    handlers.onUpdateWaiting(fakeRegistration);

    expect(notify).toHaveBeenCalledTimes(1);
    const [notification, options] = notify.mock.calls[0];
    expect(notification.title).toBe('New version available');
    expect(options).toEqual({ duration: Infinity });
    expect(notification.actions).toHaveLength(1);
    expect(notification.actions[0].key).toBe('reload');
  });

  it("reload action activates the waiting worker before reloading", async () => {
    const { registerServiceWorkerWithUpdateNotice } = await import(
      '../service-worker-update-notice'
    );
    const reloadSpy = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { reload: reloadSpy },
      configurable: true,
    });

    registerServiceWorkerWithUpdateNotice();
    const handlers = registerServiceWorker.mock.calls[0][0];
    const fakeRegistration = {};
    handlers.onUpdateWaiting(fakeRegistration);

    const [notification] = notify.mock.calls[0];
    await notification.actions[0].onClick();

    expect(activateWaitingServiceWorker).toHaveBeenCalledWith(
      fakeRegistration
    );
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });
});
