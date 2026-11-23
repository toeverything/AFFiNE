/**
 * @vitest-environment happy-dom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';

const tokens = vi.hoisted(() => ({
  WorkspaceShareSettingService: class {},
  WorkspaceSubscriptionService: class {},
  SubscriptionService: class {},
  ServerService: class {},
  WorkspaceMembersService: class {},
  WorkspacePermissionService: class {},
  WorkspaceQuotaService: class {},
}));

const { notify, inviteMembers } = vi.hoisted(() => ({
  notify: Object.assign(vi.fn(), { error: vi.fn() }),
  inviteMembers: vi.fn(),
}));

vi.mock('@toeverything/infra', () => {
  type Live = {
    value: unknown;
    map: (fn: (v: unknown) => unknown) => Live;
    selector: (fn: (v: unknown) => unknown) => Live;
  };
  const live = (value: unknown): Live => ({
    value,
    map: fn => live(fn(value)),
    selector: fn => live(fn(value)),
  });
  const services = new Map<unknown, unknown>([
    [
      tokens.WorkspaceShareSettingService,
      {
        sharePreview: {
          inviteLink$: live(null),
          revalidateInviteLink: vi.fn(),
        },
      },
    ],
    [
      tokens.WorkspaceSubscriptionService,
      { subscription: { subscription$: live(null) } },
    ],
    [tokens.SubscriptionService, { subscription: { pro$: live(null) } }],
    [
      tokens.ServerService,
      { server: { features$: live({}), config$: live({}) } },
    ],
    [
      tokens.WorkspaceMembersService,
      { members: { revalidate: vi.fn() }, inviteMembers },
    ],
    [
      tokens.WorkspacePermissionService,
      {
        permission: {
          isOwner$: live(true),
          isAdmin$: live(false),
          revalidate: vi.fn(),
        },
      },
    ],
    [
      tokens.WorkspaceQuotaService,
      {
        quota: {
          revalidate: vi.fn(),
          isRevalidating$: live(false),
          error$: live(null),
          quota$: live({
            memberCount: 1,
            memberLimit: 3,
            humanReadable: { name: 'Free', memberLimit: '3' },
          }),
        },
      },
    ],
  ]);
  return {
    useService: (token: unknown) => services.get(token),
    useLiveData: (data: Live | undefined) => data?.value,
  };
});

vi.mock('@affine/core/modules/cloud', () => ({
  ServerService: tokens.ServerService,
  SubscriptionService: tokens.SubscriptionService,
  WorkspaceSubscriptionService: tokens.WorkspaceSubscriptionService,
}));
vi.mock('@affine/core/modules/permissions', () => ({
  WorkspaceMembersService: tokens.WorkspaceMembersService,
  WorkspacePermissionService: tokens.WorkspacePermissionService,
}));
vi.mock('@affine/core/modules/quota', () => ({
  WorkspaceQuotaService: tokens.WorkspaceQuotaService,
}));
vi.mock('@affine/core/modules/share-setting', () => ({
  WorkspaceShareSettingService: tokens.WorkspaceShareSettingService,
}));

vi.mock('@affine/component', () => ({
  Button: ({
    children,
    onClick,
  }: {
    children: ReactNode;
    onClick: () => void;
  }) => <button onClick={onClick}>{children}</button>,
  notify,
  useConfirmModal: () => ({
    openConfirmModal: vi.fn(),
    closeConfirmModal: vi.fn(),
  }),
}));

vi.mock('@affine/component/member-components', () => ({
  InviteTeamMemberModal: ({
    isMutating,
    onConfirm,
  }: {
    isMutating: boolean;
    onConfirm: (input: { emails: string[] }) => void;
  }) => (
    <button
      data-testid="send-invites"
      aria-busy={isMutating}
      onClick={() => onConfirm({ emails: ['member@example.com'] })}
    />
  ),
  MemberLimitModal: () => null,
}));

vi.mock('@affine/component/setting-components', () => ({
  SettingRow: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@affine/core/components/pure/file-upload', () => ({
  Upload: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@affine/i18n', () => ({
  useI18n: () => new Proxy({}, { get: (_, key: string) => () => key }),
}));

vi.mock('./member-list', () => ({
  MemberList: () => null,
  MemberListError: () => null,
  MemberListFallback: () => null,
}));

import { CloudWorkspaceMembersPanel } from './cloud-members-panel';

describe('CloudWorkspaceMembersPanel invite', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  test.each([
    {
      name: 'success',
      invite: () => Promise.resolve([{ email: 'member@example.com' }]),
      errorToast: false,
    },
    {
      name: 'failure',
      invite: () => Promise.reject(new Error('Too many requests.')),
      errorToast: true,
    },
  ])(
    'stops loading after $name, error toast: $errorToast',
    async ({ invite, errorToast }) => {
      inviteMembers.mockImplementation(invite);
      render(<CloudWorkspaceMembersPanel onChangeSettingState={vi.fn()} />);

      const button = screen.getByTestId('send-invites');
      fireEvent.click(button);
      expect(button.getAttribute('aria-busy')).toBe('true');

      await vi.waitFor(() => {
        expect(button.getAttribute('aria-busy')).toBe('false');
      });
      expect(notify.error).toHaveBeenCalledTimes(errorToast ? 1 : 0);
      if (errorToast) {
        expect(notify.error).toHaveBeenCalledWith(
          expect.objectContaining({ message: 'Too many requests.' })
        );
      }
    }
  );
});
