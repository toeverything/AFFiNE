/**
 * @vitest-environment happy-dom
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';

const setNativeSignIn = (implementation: ReturnType<typeof vi.fn>) => {
  Object.defineProperty(window, 'showNativeSignIn', {
    configurable: true,
    writable: true,
    value: implementation,
  });
};

vi.mock('@affine/component', () => ({
  Modal: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div role="dialog">{children}</div> : null,
}));

vi.mock('@toeverything/theme/v2', () => ({
  cssVarV2: () => 'mock-color',
}));

vi.mock('../../components/sign-in', () => ({
  MobileSignInPanel: ({
    onClose,
    server,
    initStep,
    showCloseButton,
  }: {
    onClose: () => void;
    server?: string;
    initStep?: string;
    showCloseButton?: boolean;
  }) => (
    <div>
      <span>mobile-sign-in-panel</span>
      <span>{server}</span>
      <span>{initStep}</span>
      <span>{showCloseButton ? 'show-close' : 'hide-close'}</span>
      <button onClick={onClose}>close</button>
    </div>
  ),
}));

import { SignInDialog } from './index';

describe('SignInDialog', () => {
  afterEach(() => {
    cleanup();
    delete window.showNativeSignIn;
    vi.unstubAllGlobals();
  });

  test('closes the dialog when native sign-in is cancelled', async () => {
    const close = vi.fn();
    setNativeSignIn(vi.fn().mockResolvedValue(null));

    render(
      <SignInDialog
        close={close}
        server="https://app.affine.pro"
        step="signIn"
      />
    );

    await waitFor(() => {
      expect(close).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByText('mobile-sign-in-panel')).toBeNull();
  });

  test('falls back to the web sign-in panel when native bridge is unavailable', async () => {
    const close = vi.fn();

    render(
      <SignInDialog
        close={close}
        server="https://app.affine.pro"
        step="signIn"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('mobile-sign-in-panel')).not.toBeNull();
    });
    expect(close).not.toHaveBeenCalled();
  });

  test('closes the dialog after native sign-in succeeds', async () => {
    const close = vi.fn();
    setNativeSignIn(vi.fn().mockResolvedValue('user-id'));

    render(
      <SignInDialog
        close={close}
        server="https://app.affine.pro"
        step="signIn"
      />
    );

    await waitFor(() => {
      expect(close).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByText('mobile-sign-in-panel')).toBeNull();
  });
});
