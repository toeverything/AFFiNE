// @vitest-environment happy-dom

import type * as Component from '@affine/component';
import type * as I18n from '@affine/i18n';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type * as Infra from '@toeverything/infra';
import { BehaviorSubject } from 'rxjs';
import { afterEach, expect, test, vi } from 'vitest';

import { WorkspaceCard } from './index';

const mocks = vi.hoisted(() => ({
  copy: vi.fn().mockResolvedValue(true),
  navigate: vi.fn(),
  workspace: undefined as unknown,
}));

vi.mock('@affine/i18n', async importOriginal => ({
  ...(await importOriginal<typeof I18n>()),
  useI18n: () => new Proxy({}, { get: (_target, key) => () => String(key) }),
}));

vi.mock('@affine/core/components/hooks/use-workspace', () => ({
  useWorkspace: () => mocks.workspace,
}));
vi.mock('@affine/core/components/hooks/use-workspace-info', () => ({
  useWorkspaceInfo: () => ({ name: 'Test workspace' }),
}));
vi.mock('@affine/core/components/hooks/use-system-online', () => ({
  useSystemOnline: () => true,
}));
vi.mock('@affine/core/utils/clipboard', () => ({
  copyTextToClipboard: mocks.copy,
}));
vi.mock('../../hooks/use-navigate-helper', () => ({
  useNavigateHelper: () => ({ jumpToWorkspaceSettings: mocks.navigate }),
}));
vi.mock('../../workspace-avatar', () => ({ WorkspaceAvatar: () => <span /> }));
vi.mock('@toeverything/infra', async importOriginal => ({
  ...(await importOriginal<typeof Infra>()),
  useService: () => ({ server$: () => undefined }),
}));
vi.mock('@affine/component', async importOriginal => ({
  ...(await importOriginal<typeof Component>()),
  Tooltip: ({
    content,
    children,
  }: {
    content: React.ReactNode;
    children: React.ReactNode;
  }) => (
    <>
      {children}
      {content}
    </>
  ),
}));

afterEach(() => {
  mocks.copy.mockClear();
  mocks.navigate.mockClear();
  vi.unstubAllGlobals();
});

test.each([undefined, 'server-revision'])(
  'root pause displays diagnostics with revision %s',
  async sourceRevision => {
    vi.stubGlobal('BUILD_CONFIG', {
      ...BUILD_CONFIG,
      isElectron: !!sourceRevision,
    });
    mocks.workspace = {
      id: 'workspace-source',
      flavour: 'cloud',
      engine: {
        doc: {
          state$: new BehaviorSubject({
            total: 2,
            syncing: 0,
            synced: false,
            syncRetrying: false,
            syncErrorMessage: 'root is invalid',
            syncError: {
              docId: 'workspace-source',
              name: 'DOC_ROOT_SOURCE_INVALID',
              data: { sourceRevision },
            },
          }),
        },
      },
    };
    const view = render(
      <WorkspaceCard
        workspaceMetadata={{ id: 'workspace-source', flavour: 'cloud' }}
        showSyncStatus
      />
    );
    try {
      expect(await screen.findByText('Upload paused')).toBeTruthy();
      expect(screen.getByText(/workspace index needs attention/)).toBeTruthy();
      expect(screen.queryByText(/Synced with/)).toBeNull();
      fireEvent.click(screen.getByText('Copy diagnostics'));
      await waitFor(() => expect(mocks.copy).toHaveBeenCalledTimes(1));
      const diagnostics = JSON.parse(mocks.copy.mock.calls[0][0]);
      expect(diagnostics).toEqual({
        workspaceId: 'workspace-source',
        docId: 'workspace-source',
        code: 'DOC_ROOT_SOURCE_INVALID',
        ...(sourceRevision ? { sourceRevision } : {}),
      });
      if (sourceRevision) {
        fireEvent.click(screen.getByText('Open Quick Export'));
        await waitFor(() =>
          expect(mocks.navigate).toHaveBeenCalledWith('workspace-source', {
            tab: 'workspace:storage',
          })
        );
      } else {
        expect(screen.queryByText('Open Quick Export')).toBeNull();
      }
    } finally {
      view.unmount();
    }
  }
);
