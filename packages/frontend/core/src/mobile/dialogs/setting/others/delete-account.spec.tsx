/**
 * @vitest-environment happy-dom
 */

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type * as Infra from '@toeverything/infra';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

type ProfileInfo = {
  isOwner?: boolean;
  isTeam?: boolean;
};

type SubjectLike<T> = {
  next: (value: T) => void;
};

const deleteAccount = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const notifyError = vi.hoisted(() => vi.fn());
const trackDeleteAccount = vi.hoisted(() => vi.fn());
const liveDataFrom = vi.hoisted(() => vi.fn());
const accountState = vi.hoisted(() => ({
  value: {
    email: 'user@example.com',
    label: 'User',
  },
}));
const workspaceState = vi.hoisted(() => ({
  workspaces$: null as SubjectLike<unknown[]> | null,
  profile$: null as SubjectLike<ProfileInfo | null> | null,
  profileLoading$: null as SubjectLike<boolean> | null,
  revalidate: null as { mockClear: () => void } | null,
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
        {onCancel !== false ? (
          <button
            onClick={event => {
              cancelButtonOptions?.onClick?.(event);
              if (!event.defaultPrevented) {
                onCancel?.();
              }
              if (!event.defaultPrevented) {
                onOpenChange?.(false);
              }
            }}
          >
            {cancelText}
          </button>
        ) : null}
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

vi.mock('@toeverything/infra', async () => {
  const actual = await vi.importActual<typeof Infra>('@toeverything/infra');
  const { BehaviorSubject } = await import('rxjs');

  const workspaces$ = new BehaviorSubject<unknown[]>([]);
  const profile$ = new BehaviorSubject<ProfileInfo | null>(null);
  const profileLoading$ = new BehaviorSubject(false);
  const profile = {
    profile$,
    isLoading$: profileLoading$,
    revalidate: vi.fn(),
  };
  workspaceState.workspaces$ = workspaces$;
  workspaceState.profile$ = profile$;
  workspaceState.profileLoading$ = profileLoading$;
  workspaceState.revalidate = profile.revalidate;
  liveDataFrom.mockImplementation((source, initialValue) =>
    actual.LiveData.from(source, initialValue)
  );

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
      ['workspaces$']: workspaces$,
    },
    getProfile: vi.fn(() => profile),
  };

  return {
    LiveData: {
      from: liveDataFrom,
    },
    useLiveData: (source: unknown) => {
      if (source === authSessionAccountStream) {
        return accountState.value;
      }
      if (typeof source === 'object' && source !== null && 'value' in source) {
        return (source as { value: unknown }).value;
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
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    deleteAccount.mockClear();
    notifyError.mockClear();
    trackDeleteAccount.mockClear();
    liveDataFrom.mockClear();
    workspaceState.workspaces$?.next([]);
    workspaceState.profile$?.next(null);
    workspaceState.profileLoading$?.next(false);
    workspaceState.revalidate?.mockClear();
    accountState.value = {
      email: 'user@example.com',
      label: 'User',
    };
    deleteAccount.mockResolvedValue(undefined);
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

  test('deletes the account after confirming the account email', async () => {
    const onDeleteFinished = vi.fn();

    render(<DeleteAccount onDeleteFinished={onDeleteFinished} />);

    fireEvent.click(
      screen.getByRole('button', {
        name: 'com.affine.mobile.setting.others.delete-account',
      })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: ' USER@EXAMPLE.COM ' },
    });
    fireEvent.click(
      screen.getByRole('button', {
        name: 'com.affine.setting.account.delete.confirm-button',
      })
    );

    await waitFor(() => {
      expect(deleteAccount).toHaveBeenCalledOnce();
    });
    expect(trackDeleteAccount).toHaveBeenCalledOnce();
    expect(onDeleteFinished).toHaveBeenCalledOnce();
  });

  test('shows an error and clears loading when account deletion fails', async () => {
    const error = new Error('delete failed');
    deleteAccount.mockRejectedValueOnce(error);

    render(<DeleteAccount />);

    fireEvent.click(
      screen.getByRole('button', {
        name: 'com.affine.mobile.setting.others.delete-account',
      })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'user@example.com' },
    });
    fireEvent.click(
      screen.getByRole('button', {
        name: 'com.affine.setting.account.delete.confirm-button',
      })
    );

    await waitFor(() => {
      expect(notifyError).toHaveBeenCalledWith(error);
    });
    expect(trackDeleteAccount).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(
        screen.getByRole('button', {
          name: 'com.affine.setting.account.delete.confirm-button',
        })
      ).not.toHaveProperty('disabled', true);
    });
  });

  test('blocks account deletion for team workspace owners', () => {
    workspaceState.workspaces$?.next([{ id: 'team-workspace' }]);
    workspaceState.profile$?.next({ isTeam: true, isOwner: true });

    render(<DeleteAccount />);

    fireEvent.click(
      screen.getByRole('button', {
        name: 'com.affine.mobile.setting.others.delete-account',
      })
    );

    expect(
      screen.getByText('com.affine.setting.account.delete.team-warning-title')
    ).toBeTruthy();
    expect(
      screen.queryByText(
        'com.affine.setting.account.delete.email-confirm-title'
      )
    ).toBeNull();
    expect(workspaceState.revalidate).toHaveBeenCalled();
  });

  test('hides account deletion until workspace ownership is known', () => {
    workspaceState.workspaces$?.next([{ id: 'workspace' }]);
    workspaceState.profileLoading$?.next(true);

    render(<DeleteAccount />);

    expect(
      screen.queryByRole('button', {
        name: 'com.affine.mobile.setting.others.delete-account',
      })
    ).toBeNull();
  });

  test('keeps account deletion available after a failed profile load', () => {
    workspaceState.workspaces$?.next([{ id: 'workspace' }]);

    render(<DeleteAccount />);

    expect(
      screen.getByRole('button', {
        name: 'com.affine.mobile.setting.others.delete-account',
      })
    ).toBeTruthy();
  });
});
