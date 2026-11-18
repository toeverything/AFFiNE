/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  activateWaitingServiceWorker,
  registerServiceWorker,
} from '../register-service-worker';

class FakeServiceWorker extends EventTarget {
  state = 'installing';
  postMessage = vi.fn();
}

class FakeRegistration extends EventTarget {
  waiting: FakeServiceWorker | null = null;
  installing: FakeServiceWorker | null = null;
}

describe('registerServiceWorker', () => {
  const originalServiceWorker = (navigator as any).serviceWorker;

  afterEach(() => {
    Object.defineProperty(navigator, 'serviceWorker', {
      value: originalServiceWorker,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  it('does nothing when the browser has no serviceWorker support', () => {
    // Real unsupporting browsers don't have the key at all — registerServiceWorker
    // uses `'serviceWorker' in navigator`, so the test must delete the key,
    // not just set it to undefined (which would still leave the key present).
    delete (navigator as any).serviceWorker;
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

    registerServiceWorker();

    expect(addEventListenerSpy).not.toHaveBeenCalled();
  });

  it('registers /service-worker.js once the page has loaded', () => {
    const register = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { register },
      configurable: true,
    });

    registerServiceWorker();
    window.dispatchEvent(new Event('load'));

    expect(register).toHaveBeenCalledWith('/service-worker.js');
  });

  it('does not throw when registration rejects', async () => {
    const register = vi.fn().mockRejectedValue(new Error('boom'));
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { register },
      configurable: true,
    });
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    registerServiceWorker();
    window.dispatchEvent(new Event('load'));
    // let the rejected promise's .catch handler run
    await Promise.resolve();
    await Promise.resolve();

    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('fires onUpdateWaiting immediately if a worker is already waiting on load', async () => {
    const registration = new FakeRegistration();
    registration.waiting = new FakeServiceWorker();
    const register = vi.fn().mockResolvedValue(registration);
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { register },
      configurable: true,
    });
    const onUpdateWaiting = vi.fn();

    registerServiceWorker({ onUpdateWaiting });
    window.dispatchEvent(new Event('load'));
    await Promise.resolve();
    await Promise.resolve();

    expect(onUpdateWaiting).toHaveBeenCalledWith(registration);
  });

  it('fires onUpdateWaiting when a new worker installs on an already-controlled page', async () => {
    const registration = new FakeRegistration();
    const register = vi.fn().mockResolvedValue(registration);
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { register, controller: {} },
      configurable: true,
    });
    const onUpdateWaiting = vi.fn();

    registerServiceWorker({ onUpdateWaiting });
    window.dispatchEvent(new Event('load'));
    await Promise.resolve();
    await Promise.resolve();

    // Simulate the browser assigning `installing` and firing 'updatefound',
    // then the installing worker transitioning to 'installed'.
    const installing = new FakeServiceWorker();
    registration.installing = installing;
    registration.dispatchEvent(new Event('updatefound'));
    installing.state = 'installed';
    installing.dispatchEvent(new Event('statechange'));

    expect(onUpdateWaiting).toHaveBeenCalledWith(registration);
  });

  it('does not fire onUpdateWaiting for the very first install (no existing controller)', async () => {
    const registration = new FakeRegistration();
    const register = vi.fn().mockResolvedValue(registration);
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { register, controller: null },
      configurable: true,
    });
    const onUpdateWaiting = vi.fn();

    registerServiceWorker({ onUpdateWaiting });
    window.dispatchEvent(new Event('load'));
    await Promise.resolve();
    await Promise.resolve();

    const installing = new FakeServiceWorker();
    registration.installing = installing;
    registration.dispatchEvent(new Event('updatefound'));
    installing.state = 'installed';
    installing.dispatchEvent(new Event('statechange'));

    expect(onUpdateWaiting).not.toHaveBeenCalled();
  });
});

describe('activateWaitingServiceWorker', () => {
  const originalServiceWorker = (navigator as any).serviceWorker;

  afterEach(() => {
    Object.defineProperty(navigator, 'serviceWorker', {
      value: originalServiceWorker,
      configurable: true,
    });
  });

  it('resolves immediately when there is no waiting worker', async () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      value: new EventTarget(),
      configurable: true,
    });
    const registration = new FakeRegistration();

    await expect(
      activateWaitingServiceWorker(registration as any)
    ).resolves.toBeUndefined();
  });

  it('posts SKIP_WAITING and resolves once controllerchange fires', async () => {
    const swContainer = new EventTarget();
    Object.defineProperty(navigator, 'serviceWorker', {
      value: swContainer,
      configurable: true,
    });
    const registration = new FakeRegistration();
    registration.waiting = new FakeServiceWorker();

    const activated = activateWaitingServiceWorker(registration as any);
    expect(registration.waiting.postMessage).toHaveBeenCalledWith({
      type: 'SKIP_WAITING',
    });

    swContainer.dispatchEvent(new Event('controllerchange'));
    await expect(activated).resolves.toBeUndefined();
  });
});
