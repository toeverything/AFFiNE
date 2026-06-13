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
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const gqlMock = vi.hoisted(() => vi.fn());
const workspaceState = vi.hoisted(() => ({
  id: 'workspace-1',
}));
const electronApiState = vi.hoisted(() => ({
  apis: undefined as
    | {
        byokStorage?: {
          isSupported: () => Promise<boolean>;
          listWorkspaceKeys: (workspaceId: string) => Promise<unknown[]>;
        };
      }
    | undefined,
}));
const WorkspaceServerServiceToken = vi.hoisted(
  () => class WorkspaceServerService {}
);
const WorkspaceServiceToken = vi.hoisted(() => class WorkspaceService {});

const ByokProvider = vi.hoisted(() => ({
  openai: 'openai',
  anthropic: 'anthropic',
  gemini: 'gemini',
  fal: 'fal',
}));
const ByokKeyStorage = vi.hoisted(() => ({
  server: 'server',
  local: 'local',
}));
const ByokKeyTestStatus = vi.hoisted(() => ({
  untested: 'untested',
  passed: 'passed',
  failed: 'failed',
}));

const workspaceByokSettingsQuery = vi.hoisted(() =>
  Symbol('workspaceByokSettingsQuery')
);
const testWorkspaceByokConfigMutation = vi.hoisted(() =>
  Symbol('testWorkspaceByokConfigMutation')
);
const upsertWorkspaceByokConfigMutation = vi.hoisted(() =>
  Symbol('upsertWorkspaceByokConfigMutation')
);
const clearWorkspaceByokConfigsMutation = vi.hoisted(() =>
  Symbol('clearWorkspaceByokConfigsMutation')
);
const deleteWorkspaceByokConfigMutation = vi.hoisted(() =>
  Symbol('deleteWorkspaceByokConfigMutation')
);

vi.mock('@affine/component', () => ({
  Button: ({
    children,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) => (
    <button {...props}>{children}</button>
  ),
  DragHandle: () => <span>drag-handle</span>,
  IconButton: ({ title, onClick }: { title: string; onClick?: () => void }) => (
    <button onClick={onClick}>{title}</button>
  ),
  Modal: ({
    open,
    title,
    children,
  }: {
    open: boolean;
    title: string;
    children: ReactNode;
  }) =>
    open ? (
      <div role="dialog" aria-label={title}>
        {children}
      </div>
    ) : null,
  notify: {
    error: vi.fn(),
  },
}));

vi.mock('@affine/component/setting-components', () => ({
  SettingHeader: ({
    title,
    subtitle,
  }: {
    title: string;
    subtitle?: string;
  }) => (
    <header>
      <h1>{title}</h1>
      {subtitle ? <p>{subtitle}</p> : null}
    </header>
  ),
  SettingWrapper: ({ children }: { children: ReactNode }) => (
    <main>{children}</main>
  ),
}));

vi.mock('@affine/core/modules/cloud', () => ({
  WorkspaceServerService: WorkspaceServerServiceToken,
}));

vi.mock('@affine/core/modules/workspace', () => ({
  WorkspaceService: WorkspaceServiceToken,
}));

vi.mock('@affine/electron-api', () => ({
  get apis() {
    return electronApiState.apis;
  },
}));

vi.mock('@affine/graphql', () => ({
  ByokKeyStorage,
  ByokKeyTestStatus,
  ByokProvider,
  clearWorkspaceByokConfigsMutation,
  deleteWorkspaceByokConfigMutation,
  testWorkspaceByokConfigMutation,
  upsertWorkspaceByokConfigMutation,
  workspaceByokSettingsQuery,
}));

vi.mock('@affine/i18n', () => {
  const messages: Record<string, string> = {
    'com.affine.settings.workspace.byok.action.add-key': 'Add key',
    'com.affine.settings.workspace.byok.action.edit': 'Edit',
    'com.affine.settings.workspace.byok.action.delete': 'Delete',
    'com.affine.settings.workspace.byok.action.test-key': 'Test key',
    'com.affine.settings.workspace.byok.action.save-key': 'Save key',
    'com.affine.settings.workspace.byok.action.cancel': 'Cancel',
    'com.affine.settings.workspace.byok.action.clear-all':
      'Clear all BYOK keys',
    'com.affine.settings.workspace.byok.field.api-key': 'API key',
    'com.affine.settings.workspace.byok.field.storage': 'Key storage',
    'com.affine.settings.workspace.byok.placeholder.key-name': 'Primary',
    'com.affine.settings.workspace.byok.status.key-verified': 'Key verified',
    'com.affine.settings.workspace.byok.status.disabled-after-failure':
      'Disabled after failure',
    'com.affine.settings.workspace.byok.storage.local': 'Local',
    'com.affine.settings.workspace.byok.storage.server': 'Server',
    'com.affine.settings.workspace.byok.storage.local-this-device':
      'Local (this device)',
    'com.affine.settings.workspace.byok.storage.local-desktop-only':
      'Local (Desktop only)',
    'com.affine.settings.workspace.byok.usage.tokens': '{{count}} tokens',
    'com.affine.settings.workspace.byok.notify.operation-failed.message':
      'Please try again.',
    'com.affine.settings.workspace.byok.notify.test-failed.title':
      'Key test failed',
    'com.affine.settings.workspace.byok.notify.load-failed.title':
      'BYOK settings not loaded',
    'com.affine.settings.workspace.byok.notify.save-failed.title':
      'BYOK key not saved',
    'com.affine.settings.workspace.byok.notify.delete-failed.title':
      'BYOK key not deleted',
    'com.affine.settings.workspace.byok.notify.reorder-failed.title':
      'BYOK keys not reordered',
    'com.affine.settings.workspace.byok.notify.clear-failed.title':
      'BYOK keys not cleared',
  };
  const translate = (key: string, options?: Record<string, unknown>) => {
    let message = messages[key] ?? key;
    for (const [name, value] of Object.entries(options ?? {})) {
      message = message.replaceAll(`{{${name}}}`, String(value));
    }
    return message;
  };
  const t = new Proxy(
    {
      t: translate,
    },
    {
      get(target, key: string) {
        if (key in target) {
          return target[key as keyof typeof target];
        }
        return (options?: Record<string, unknown>) => translate(key, options);
      },
    }
  );

  return {
    useI18n: () => t,
  };
});

vi.mock('@blocksuite/icons/rc', () => ({
  ChatWithAiIcon: () => <span>chat-ai</span>,
  DeleteIcon: () => <span>delete</span>,
  EditIcon: () => <span>edit</span>,
  ImageIcon: () => <span>image</span>,
  PenIcon: () => <span>pen</span>,
  TocIcon: () => <span>toc</span>,
  TranscriptWithAiIcon: () => <span>transcript</span>,
}));

vi.mock('@toeverything/infra', async importOriginal => {
  const actual = await importOriginal<typeof Infra>();

  return {
    ...actual,
    useService: (token: unknown) => {
      if (token === WorkspaceServerServiceToken) {
        return {
          server: {
            gql: gqlMock,
          },
        };
      }
      if (token === WorkspaceServiceToken) {
        return {
          workspace: workspaceState,
        };
      }
      return {};
    },
  };
});

import { WorkspaceByokSetting } from '.';
import { logByokError } from './errors';
import { UsagePanel } from './usage';

function settings(overrides: Record<string, unknown> = {}) {
  return {
    workspaceId: 'workspace-1',
    entitled: true,
    serverEntitled: true,
    localEntitled: false,
    entitlementRequired: ['Pro', 'Team', 'Believer'],
    allowedProviders: ['openai', 'anthropic', 'gemini', 'fal'],
    localStorageSupported: false,
    customEndpointSupported: false,
    hasAiPlan: true,
    keys: [],
    warnings: [],
    ...overrides,
  };
}

function byokKey(overrides: Record<string, unknown> = {}) {
  return {
    id: 'server-key',
    provider: ByokProvider.openai,
    name: 'Primary',
    description: 'Workspace fallback key',
    storage: ByokKeyStorage.server,
    configured: true,
    enabled: true,
    endpoint: null,
    endpointEditable: false,
    sortOrder: 0,
    capabilities: ['Text', 'Image input', 'Actions', 'Image generate'],
    testStatus: ByokKeyTestStatus.passed,
    disabledReason: null,
    lastTestedAt: null,
    lastTestError: null,
    lastUsedAt: null,
    lastErrorAt: null,
    lastError: null,
    ...overrides,
  };
}

function settingsResponse(overrides: Record<string, unknown> = {}) {
  return {
    workspace: {
      byokSettings: settings(overrides),
      byokUsage: [],
    },
  };
}

describe('WorkspaceByokSetting', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    gqlMock.mockReset();
    gqlMock.mockImplementation(async ({ query }) => {
      if (query === workspaceByokSettingsQuery) {
        return settingsResponse();
      }
      throw new Error('Unexpected GraphQL operation');
    });
    vi.stubGlobal('BUILD_CONFIG', { isElectron: false });
    electronApiState.apis = undefined;
  });

  test('renders locked state without key management controls', async () => {
    gqlMock.mockImplementation(async ({ query }) => {
      if (query === workspaceByokSettingsQuery) {
        return settingsResponse({
          entitled: false,
          serverEntitled: false,
          localEntitled: false,
        });
      }
      throw new Error('Unexpected GraphQL operation');
    });

    render(<WorkspaceByokSetting />);

    await screen.findByTestId('workspace-byok-locked');
    expect(screen.queryByText('Add key')).toBeNull();
    expect(screen.queryByTestId('workspace-byok-empty')).toBeNull();
  });

  test('renders empty state and keeps save disabled until key test passes', async () => {
    gqlMock.mockImplementation(async ({ query }) => {
      if (query === workspaceByokSettingsQuery) {
        return settingsResponse();
      }
      if (query === testWorkspaceByokConfigMutation) {
        return {
          testWorkspaceByokConfig: {
            ok: true,
            status: 'passed',
            message: null,
          },
        };
      }
      if (query === upsertWorkspaceByokConfigMutation) {
        return { upsertWorkspaceByokConfig: { id: 'server-key' } };
      }
      throw new Error('Unexpected GraphQL operation');
    });

    render(<WorkspaceByokSetting />);

    await screen.findByTestId('workspace-byok-empty');
    fireEvent.click(screen.getAllByText('Add key')[0]);
    expect(screen.getByText<HTMLButtonElement>('Save key').disabled).toBe(true);

    fireEvent.change(screen.getByPlaceholderText('Primary'), {
      target: { value: 'Primary' },
    });
    fireEvent.change(screen.getByLabelText('API key'), {
      target: { value: 'sk-test' },
    });
    fireEvent.click(screen.getByText('Test key'));

    await screen.findByText('Key verified');
    expect(screen.getByText<HTMLButtonElement>('Save key').disabled).toBe(
      false
    );
    fireEvent.click(screen.getByText('Save key'));

    await waitFor(() => {
      expect(gqlMock).toHaveBeenCalledWith(
        expect.objectContaining({
          query: upsertWorkspaceByokConfigMutation,
        })
      );
    });
  });

  test('keeps local storage disabled on web even for local-entitled users', async () => {
    gqlMock.mockImplementation(async ({ query }) => {
      if (query === workspaceByokSettingsQuery) {
        return settingsResponse({
          localEntitled: true,
          localStorageSupported: true,
        });
      }
      throw new Error('Unexpected GraphQL operation');
    });

    render(<WorkspaceByokSetting />);

    await screen.findByTestId('workspace-byok-empty');
    fireEvent.click(screen.getAllByText('Add key')[0]);

    const storageSelect =
      screen.getByLabelText<HTMLSelectElement>('Key storage');
    const localOption = Array.from(storageSelect.options).find(
      option => option.value === ByokKeyStorage.local
    );
    expect(localOption?.disabled).toBe(true);
  });

  test('reorders server keys within their storage bucket', async () => {
    gqlMock.mockImplementation(async ({ query }) => {
      if (query === workspaceByokSettingsQuery) {
        return settingsResponse({
          keys: [
            byokKey({ id: 'server-1', name: 'First', sortOrder: 0 }),
            byokKey({ id: 'server-2', name: 'Second', sortOrder: 1 }),
          ],
        });
      }
      return {};
    });

    render(<WorkspaceByokSetting />);

    const firstRow = (await screen.findByText('OpenAI / First')).closest(
      '[draggable="true"]'
    );
    const secondRow = screen
      .getByText('OpenAI / Second')
      .closest('[draggable="true"]');

    expect(firstRow).not.toBeNull();
    expect(secondRow).not.toBeNull();
    fireEvent.dragStart(firstRow as Element);
    fireEvent.dragOver(secondRow as Element);
    fireEvent.drop(secondRow as Element);

    await waitFor(() => {
      expect(gqlMock).toHaveBeenCalledWith(
        expect.objectContaining({
          variables: expect.objectContaining({
            input: expect.objectContaining({
              workspaceId: 'workspace-1',
              storage: ByokKeyStorage.server,
              ids: ['server-2', 'server-1'],
            }),
          }),
        })
      );
    });
  });

  test('marks coverage rows by configured provider support', async () => {
    let keys = [
      byokKey({ provider: ByokProvider.openai }),
      byokKey({
        id: 'disabled-gemini',
        provider: ByokProvider.gemini,
        enabled: false,
        capabilities: [
          'Text',
          'Image input',
          'Actions',
          'Image generate',
          'Transcript',
          'Indexing',
        ],
      }),
      byokKey({
        id: 'local-gemini',
        provider: ByokProvider.gemini,
        storage: ByokKeyStorage.local,
        capabilities: ['Text', 'Image input', 'Actions', 'Image generate'],
      }),
    ];

    gqlMock.mockImplementation(async ({ query }) => {
      if (query === workspaceByokSettingsQuery) {
        return settingsResponse({
          keys,
        });
      }
      throw new Error('Unexpected GraphQL operation');
    });

    render(<WorkspaceByokSetting />);

    expect(
      (await screen.findByTestId('workspace-byok-coverage-chat')).dataset
        .covered
    ).toBe('true');
    expect(
      screen.getByTestId('workspace-byok-coverage-action').dataset.covered
    ).toBe('true');
    expect(
      screen.getByTestId('workspace-byok-coverage-image').dataset.covered
    ).toBe('true');
    expect(
      screen.getByTestId('workspace-byok-coverage-transcript').dataset.covered
    ).toBe('false');
    expect(
      screen.getByTestId('workspace-byok-coverage-workspace_indexing').dataset
        .covered
    ).toBe('false');
    expect(screen.getAllByTestId(/^workspace-byok-coverage-/)).toHaveLength(5);

    cleanup();
    keys = [
      byokKey({
        provider: ByokProvider.gemini,
        capabilities: [
          'Text',
          'Image input',
          'Actions',
          'Image generate',
          'Transcript',
          'Indexing',
        ],
      }),
    ];
    render(<WorkspaceByokSetting />);

    expect(
      (await screen.findByTestId('workspace-byok-coverage-transcript')).dataset
        .covered
    ).toBe('true');
    expect(
      screen.getByTestId('workspace-byok-coverage-workspace_indexing').dataset
        .covered
    ).toBe('true');
  });

  test('restores a failed server row after key test passes', async () => {
    gqlMock.mockImplementation(async ({ query }) => {
      if (query === workspaceByokSettingsQuery) {
        return settingsResponse({
          keys: [
            byokKey({
              enabled: false,
              testStatus: ByokKeyTestStatus.failed,
              disabledReason: 'recent_failure',
              lastErrorAt: '2026-05-01T00:00:00.000Z',
              lastError: 'Provider rejected the API key.',
            }),
          ],
        });
      }
      if (query === testWorkspaceByokConfigMutation) {
        return {
          testWorkspaceByokConfig: {
            ok: true,
            status: 'passed',
            message: null,
          },
        };
      }
      if (query === upsertWorkspaceByokConfigMutation) {
        return {
          upsertWorkspaceByokConfig: {
            id: 'server-key',
          },
        };
      }
      throw new Error('Unexpected GraphQL operation');
    });

    render(<WorkspaceByokSetting />);

    await screen.findByText('Disabled after failure');
    fireEvent.click(screen.getByText('Edit'));
    fireEvent.change(screen.getByLabelText('API key'), {
      target: { value: 'sk-test' },
    });
    fireEvent.click(screen.getByText('Test key'));

    await screen.findByText('Key verified');
    fireEvent.click(screen.getByText('Save key'));

    await waitFor(() => {
      expect(gqlMock).toHaveBeenCalledWith(
        expect.objectContaining({
          query: upsertWorkspaceByokConfigMutation,
          variables: expect.objectContaining({
            input: expect.objectContaining({
              id: 'server-key',
              enabled: true,
            }),
          }),
        })
      );
    });
  });

  test('tests a saved server key without resending plaintext', async () => {
    gqlMock.mockImplementation(async ({ query }) => {
      if (query === workspaceByokSettingsQuery) {
        return settingsResponse({
          keys: [byokKey()],
        });
      }
      if (query === testWorkspaceByokConfigMutation) {
        return {
          testWorkspaceByokConfig: {
            ok: true,
            status: 'passed',
            message: null,
          },
        };
      }
      if (query === upsertWorkspaceByokConfigMutation) {
        return {
          upsertWorkspaceByokConfig: {
            id: 'server-key',
          },
        };
      }
      throw new Error('Unexpected GraphQL operation');
    });

    render(<WorkspaceByokSetting />);

    await screen.findByText('OpenAI / Primary');
    fireEvent.click(screen.getByText('Edit'));
    expect(screen.getByText<HTMLButtonElement>('Test key').disabled).toBe(
      false
    );
    fireEvent.click(screen.getByText('Test key'));

    await waitFor(() => {
      expect(gqlMock).toHaveBeenCalledWith(
        expect.objectContaining({
          query: testWorkspaceByokConfigMutation,
          variables: expect.objectContaining({
            input: expect.objectContaining({
              apiKey: null,
              configId: 'server-key',
            }),
          }),
        })
      );
    });

    await screen.findByText('Key verified');
    fireEvent.click(screen.getByText('Save key'));

    await waitFor(() => {
      expect(gqlMock).toHaveBeenCalledWith(
        expect.objectContaining({
          query: upsertWorkspaceByokConfigMutation,
          variables: expect.objectContaining({
            input: expect.objectContaining({
              apiKey: null,
              id: 'server-key',
            }),
          }),
        })
      );
    });
  });
});

describe('UsagePanel', () => {
  afterEach(() => {
    cleanup();
  });

  test('aggregates usage rows by date before rendering bars', () => {
    const today = new Date().toISOString();
    render(
      <UsagePanel
        keys={[]}
        usage={[
          { date: today, featureKind: 'chat', totalTokens: 3 },
          { date: today, featureKind: 'transcript', totalTokens: 5 },
        ]}
        onClearAll={() => {}}
      />
    );

    expect(screen.getByTitle('8 tokens')).not.toBeNull();
  });
});

describe('logByokError', () => {
  test('logs safe metadata without raw error message', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = Object.assign(
      new Error('authorization: Bearer token=a+b%2F=='),
      {
        code: 'BAD_REQUEST',
        status: 400,
        type: 'bad_request',
      }
    );

    try {
      logByokError('byok', error);
      expect(warn).toHaveBeenCalledWith('byok', {
        name: 'Error',
        code: 'BAD_REQUEST',
        status: 400,
        type: 'bad_request',
      });
      expect(JSON.stringify(warn.mock.calls)).not.toContain('token=a+b%2F==');
    } finally {
      warn.mockRestore();
    }
  });
});
