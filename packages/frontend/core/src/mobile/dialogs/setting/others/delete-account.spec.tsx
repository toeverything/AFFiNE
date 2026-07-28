/**
 * @vitest-environment happy-dom
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const deleteAccount = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const notifyError = vi.hoisted(() => vi.fn());
const trackDeleteAccount = vi.hoisted(() => vi.fn());
const liveDataFrom = vi.hoisted(() =>
  vi.fn(() => ({ __type: 'team-owner-live-data' }))
);
const accountState = vi.hoisted(() => ({
  value: {
    email: 'user@example.com',
    label: 'User',
  },
}));
const authSessionAccountStream = vi.hoisted(() =>
  Symbol('authSessionAccount$')
);
const AuthServiceToken = vi.hoisted(() => class AuthService {});
const ServerServiceToken = vi.hoisted(() => class ServerService {});
const WorkspacesServiceToken = vi.hoisted(() => class WorkspacesService {});

vi.mock('@affine/component', () => ({
  ConfirmModal: ({
    open,
    title,
    description,
    children,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    confirmButtonOptions,
    cancelButtonOptions,
    onConfirm,
    onCancel,
    onOpenChange,
  }: any) => {
    if (!open) {
      return null;
    }

    return (
      <div>
        <div>{title}</div>
        <div>{description}</div>
        {children}
        <button
          onClick={event => {
            if (cancelButtonOptions?.onClick) {
              cancelButtonOptions.onClick(event);
              return;
            }
            if (onCancel !== false) {
              onCancel?.();
            }
            if (!event.defaultPrevented) {
              onOpenChange?.(false);
            }
          }}
        >
          {cancelText}
        </button>
        <button
          disabled={confirmButtonOptions?.disabled}
          onClick={event => {
            if (confirmButtonOptions?.onClick) {
              confirmButtonOptions.onClick(event);
              return;
            }
            onConfirm?.();
          }}
        >
          {confirmText}
        </button>
      </div>
    );
  },
  Input: ({ onChange, ...props }: any) => (
    <input
      {...props}
      onChange={event => {
        onChange?.(event.target.value);
      }}
    />
  ),
  notify: {
    error: notifyError,
  },
}));

vi.mock('@affine/core/modules/cloud', () => ({
  AuthService: AuthServiceToken,
  ServerService: ServerServiceToken,
}));

vi.mock('@affine/core/modules/workspace', () => ({
  WorkspacesService: WorkspacesServiceToken,
}));

vi.mock('@affine/error', () => ({
  UserFriendlyError: {
    fromAny: (error: unknown) => error,
  },
}));

vi.mock('@affine/i18n', () => ({
  Trans: ({ i18nKey }: { i18nKey: string }) => <span>{i18nKey}</span>,
  useI18n: () =>
    new Proxy(
      {},
      {
        get: (_, key: string) => () => key,
      }
    ),
}));

vi.mock('@affine/track', () => ({
  track: {
    ['$']: {
      ['$']: {
        auth: {
          deleteAccount: trackDeleteAccount,
        },
      },
    },
  },
}));

vi.mock('@toeverything/infra', () => {
  const authService = {
    session: {
      ['account$']: authSessionAccountStream,
    },
    deleteAccount,
  };
  const serverService = {
    server: {
      id: 'affine-cloud',
      baseUrl: 'https://affine.pro',
      ['config$']: {
        value: {
          serverName: 'AFFiNE Cloud',
        },
      },
    },
  };
  const workspacesService = {
    list: {
      ['workspaces$']: {
        pipe: vi.fn(() => ({ __type: 'workspaces-observable' })),
      },
    },
    getProfile: vi.fn(),
  };

  return {
    LiveData: {
      from: liveDataFrom,
    },
    useLiveData: (source: unknown) => {
      if (source === authSessionAccountStream) {
        return accountState.value;
      }
      if (
        typeof source === 'object' &&
        source !== null &&
        '__type' in source &&
        (source as { __type?: string }).__type === 'team-owner-live-data'
      ) {
        return false;
      }
      return undefined;
    },
    useService: (token: unknown) => {
      if (token === AuthServiceToken) {
        return authService;
      }
      if (token === ServerServiceToken) {
        return serverService;
      }
      if (token === WorkspacesServiceToken) {
        return workspacesService;
      }
      return {};
    },
  };
});

vi.mock('../row.layout', () => ({
  RowLayout: ({
    label,
    onClick,
  }: {
    label: ReactNode;
    onClick?: () => void;
  }) => <button onClick={onClick}>{label}</button>,
}));

vi.mock('./delete-account.css', () => ({
  deleteAccountLabel: 'deleteAccountLabel',
  description: 'description',
  inputWrapper: 'inputWrapper',
}));

import { DeleteAccount } from './delete-account';

describe('DeleteAccount mobile flow', () => {
  beforeEach(() => {
    deleteAccount.mockClear();
    notifyError.mockClear();
    trackDeleteAccount.mockClear();
    liveDataFrom.mockClear();
    accountState.value = {
      email: 'user@example.com',
      label: 'User',
    };
  });

  test('returns to the warning step when cancelling the email confirmation step', async () => {
    render(<DeleteAccount />);

    fireEvent.click(
      screen.getByRole('button', {
        name: 'com.affine.mobile.setting.others.delete-account',
      })
    );
    await waitFor(() => {
      expect(
        screen.getByText('com.affine.setting.account.delete.confirm-title')
      ).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => {
      expect(
        screen.getByText(
          'com.affine.setting.account.delete.email-confirm-title'
        )
      ).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => {
      expect(
        screen.getByText('com.affine.setting.account.delete.confirm-title')
      ).toBeTruthy();
    });
    expect(
      screen.queryByText(
        'com.affine.setting.account.delete.email-confirm-title'
      )
    ).toBeNull();
  });
});
