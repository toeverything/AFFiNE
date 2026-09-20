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
import type { MouseEventHandler, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const inviteMembers = vi.hoisted(() => vi.fn());
const notify = vi.hoisted(() =>
  Object.assign(vi.fn(), {
    error: vi.fn(),
    success: vi.fn(),
  })
);

const ServerServiceToken = vi.hoisted(() => class ServerService {});
const SubscriptionServiceToken = vi.hoisted(() => class SubscriptionService {});
const WorkspaceSubscriptionServiceToken = vi.hoisted(
  () => class WorkspaceSubscriptionService {}
);
const WorkspaceMembersServiceToken = vi.hoisted(
  () => class WorkspaceMembersService {}
);
const WorkspacePermissionServiceToken = vi.hoisted(
  () => class WorkspacePermissionService {}
);
const WorkspaceQuotaServiceToken = vi.hoisted(
  () => class WorkspaceQuotaService {}
);
const WorkspaceShareSettingServiceToken = vi.hoisted(
  () => class WorkspaceShareSettingService {}
);

const membersService = {
  members: { revalidate: vi.fn() },
  generateInviteLink: vi.fn(),
  revokeInviteLink: vi.fn(),
  inviteMembers,
};
const permissionService = {
  permission: {
    isOwner$: { value: true },
    isAdmin$: { value: false },
    revalidate: vi.fn(),
  },
};
const quotaService = {
  quota: {
    revalidate: vi.fn(),
    isRevalidating$: { value: false },
    error$: { value: null },
    quota$: {
      value: {
        memberLimit: 3,
        memberCount: 1,
        humanReadable: { name: 'Free', memberLimit: '3' },
      },
    },
  },
};
const shareSettingService = {
  sharePreview: {
    inviteLink$: { value: null },
    revalidateInviteLink: vi.fn(),
  },
};
const workspaceSubscriptionService = {
  subscription: {
    subscription$: { value: null },
    resumeSubscription: vi.fn(),
    waitForRevalidation: vi.fn(),
  },
};
const subscriptionService = {
  subscription: {
    pro$: {
      map: () => ({ value: undefined }),
    },
  },
};
const serverService = {
  server: {
    features$: {
      map: () => ({ value: false }),
    },
    config$: {
      selector: () => ({ value: false }),
    },
  },
};

vi.mock('@affine/component', () => ({
  Button: ({
    children,
    onClick,
  }: {
    children: ReactNode;
    onClick?: MouseEventHandler<HTMLButtonElement>;
  }) => <button onClick={onClick}>{children}</button>,
  notify,
  useConfirmModal: () => ({
    openConfirmModal: vi.fn(),
    closeConfirmModal: vi.fn(),
  }),
}));

vi.mock('@affine/component/member-components', () => ({
  InviteTeamMemberModal: ({
    open,
    isMutating,
    onConfirm,
  }: {
    open: boolean;
    isMutating: boolean;
    onConfirm: (input: { emails: string[] }) => void;
  }) =>
    open ? (
      <button
        data-testid="invite-submit"
        onClick={() => onConfirm({ emails: ['friend@example.com'] })}
      >
        {isMutating ? 'loading' : 'idle'}
      </button>
    ) : null,
  MemberLimitModal: () => null,
}));

vi.mock('@affine/component/setting-components', () => ({
  SettingRow: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@affine/core/components/hooks/affine-async-hooks', () => ({
  useAsyncCallback:
    <T extends unknown[]>(callback: (...args: T) => Promise<void>) =>
    (...args: T) => {
      void callback(...args).catch(() => {});
    },
}));

vi.mock('@affine/core/components/pure/file-upload', () => ({
  Upload: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@affine/core/modules/cloud', () => ({
  ServerService: ServerServiceToken,
  SubscriptionService: SubscriptionServiceToken,
  WorkspaceSubscriptionService: WorkspaceSubscriptionServiceToken,
}));

vi.mock('@affine/core/modules/permissions', () => ({
  WorkspaceMembersService: WorkspaceMembersServiceToken,
  WorkspacePermissionService: WorkspacePermissionServiceToken,
}));

vi.mock('@affine/core/modules/quota', () => ({
  WorkspaceQuotaService: WorkspaceQuotaServiceToken,
}));

vi.mock('@affine/core/modules/share-setting', () => ({
  WorkspaceShareSettingService: WorkspaceShareSettingServiceToken,
}));

vi.mock('@affine/core/utils/clipboard', () => ({
  copyTextToClipboard: vi.fn(),
}));

vi.mock('@affine/core/utils/email-regex', () => ({
  emailRegex: /.+@.+/,
}));

vi.mock('@affine/error', () => ({
  UserFriendlyError: {
    fromAny: (error: Error) => error,
  },
}));

vi.mock('@affine/graphql', () => ({
  ServerDeploymentType: { Selfhosted: 'Selfhosted' },
  SubscriptionPlan: { Team: 'Team' },
}));

vi.mock('@affine/i18n', () => ({
  useI18n: () =>
    new Proxy(
      {},
      {
        get: (_, key: string) => () =>
          key === 'Invite Members' ? 'Invite Members' : key,
      }
    ),
}));

vi.mock('@affine/track', () => ({
  track: {
    $: {
      settingsPanel: {
        workspace: {
          viewPlans: vi.fn(),
        },
      },
    },
  },
}));

vi.mock('@blocksuite/icons/rc', () => ({
  ExportIcon: () => null,
}));

vi.mock('@toeverything/infra', () => ({
  useLiveData: (value: { value: unknown } | unknown) => {
    if (value && typeof value === 'object' && 'value' in value) {
      return value.value;
    }
    return value;
  },
  useService: (token: unknown) => {
    if (token === ServerServiceToken) return serverService;
    if (token === SubscriptionServiceToken) return subscriptionService;
    if (token === WorkspaceSubscriptionServiceToken) {
      return workspaceSubscriptionService;
    }
    if (token === WorkspaceMembersServiceToken) return membersService;
    if (token === WorkspacePermissionServiceToken) return permissionService;
    if (token === WorkspaceQuotaServiceToken) return quotaService;
    if (token === WorkspaceShareSettingServiceToken) {
      return shareSettingService;
    }
    return {};
  },
}));

vi.mock('./member-list', () => ({
  MemberList: () => null,
  MemberListError: () => null,
  MemberListFallback: () => null,
}));

vi.mock('./styles.css', () => ({
  goUpgrade: 'goUpgrade',
  goUpgradeWrapper: 'goUpgradeWrapper',
  importButton: 'importButton',
  membersPanel: 'membersPanel',
}));

import { CloudWorkspaceMembersPanel } from './cloud-members-panel';

describe('CloudWorkspaceMembersPanel', () => {
  beforeEach(() => {
    inviteMembers.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  test('clears the loading state when an invite request is rejected', async () => {
    inviteMembers.mockRejectedValueOnce(
      new Error('This feature is temporarily unavailable for you.')
    );

    render(
      <CloudWorkspaceMembersPanel
        onChangeSettingState={vi.fn()}
        isTeam={false}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Invite Members' }));
    const submit = screen.getByTestId('invite-submit');
    expect(submit.textContent).toBe('idle');

    fireEvent.click(submit);

    await waitFor(() => expect(inviteMembers).toHaveBeenCalledOnce());
    await waitFor(() => expect(submit.textContent).toBe('idle'));
  });
});
