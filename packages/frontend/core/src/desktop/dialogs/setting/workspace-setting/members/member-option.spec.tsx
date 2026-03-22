/**
 * @vitest-environment happy-dom
 */
import { Permission, WorkspaceMemberStatus } from '@affine/graphql';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const {
  resendMemberInvite,
  revalidate,
  notify,
  MockWorkspaceMembersService,
  MockWorkspacePermissionService,
} = vi.hoisted(() => {
  const notifyFn = vi.fn();
  notifyFn.success = vi.fn();
  notifyFn.error = vi.fn();

  return {
    resendMemberInvite: vi.fn(),
    revalidate: vi.fn(),
    notify: notifyFn,
    MockWorkspaceMembersService: class MockWorkspaceMembersService {},
    MockWorkspacePermissionService: class MockWorkspacePermissionService {},
  };
});

vi.mock('@affine/core/modules/permissions', () => ({
  WorkspaceMembersService: MockWorkspaceMembersService,
  WorkspacePermissionService: MockWorkspacePermissionService,
}));

vi.mock('@affine/component', () => ({
  MenuItem: ({
    children,
    onSelect,
  }: {
    children: ReactNode;
    onSelect?: () => void;
  }) => <button onClick={onSelect}>{children}</button>,
  notify,
  useConfirmModal: () => ({
    openConfirmModal: vi.fn(),
  }),
}));

vi.mock('@toeverything/infra', () => ({
  useService: (service: unknown) => {
    if (service === MockWorkspaceMembersService) {
      return {
        resendMemberInvite,
        members: { revalidate },
      };
    }

    if (service === MockWorkspacePermissionService) {
      return {
        permission: Object.fromEntries([['isTeam' + '$', true]]) as Record<
          string,
          boolean
        >,
      };
    }

    throw new Error(`Unknown service: ${String(service)}`);
  },
  useLiveData: <T,>(value: T) => value,
}));

vi.mock('@affine/i18n', () => ({
  useI18n: () =>
    new Proxy(
      {
        t: (key: string, options?: Record<string, string>) => {
          if (
            key ===
            'com.affine.payment.member.team.resendInvite.cooldown.notify.message'
          ) {
            return `An invitation email for ${options?.name} is already queued to send.`;
          }

          if (
            key === 'com.affine.payment.member.team.resendInvite.notify.message'
          ) {
            return `You have resent the invitation for ${options?.name}`;
          }

          return key;
        },
      },
      {
        get(target, prop) {
          if (prop in target) {
            return target[prop as keyof typeof target];
          }

          if (
            prop ===
            'com.affine.payment.member.team.resendInvite.cooldown.notify.title'
          ) {
            return () => 'Invitation already queued';
          }

          return () => String(prop);
        },
      }
    ),
}));

import { MemberOptions } from './member-option';

describe('MemberOptions', () => {
  beforeEach(() => {
    resendMemberInvite.mockReset();
    revalidate.mockReset();
    notify.mockReset();
    notify.success.mockReset();
    notify.error.mockReset();
  });

  test('shows already queued notification when resend returns false', async () => {
    resendMemberInvite.mockResolvedValue(false);

    render(
      <MemberOptions
        member={{
          id: 'member-1',
          name: 'Jane Doe',
          email: 'jane@example.com',
          avatarUrl: null,
          permission: Permission.Collaborator,
          inviteId: 'invite-1',
          emailVerified: false,
          status: WorkspaceMemberStatus.Pending,
        }}
        isOwner={false}
        isAdmin={true}
        openAssignModal={() => {}}
        goToTeamBilling={() => {}}
      />
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: 'com.affine.payment.member.team.resendInvite',
      })
    );

    await waitFor(() => {
      expect(resendMemberInvite).toHaveBeenCalledWith('invite-1');
      expect(notify).toHaveBeenCalledWith({
        title: 'Invitation already queued',
        message: 'An invitation email for Jane Doe is already queued to send.',
      });
    });

    expect(notify.success).not.toHaveBeenCalled();
    expect(revalidate).not.toHaveBeenCalled();
  });
});
