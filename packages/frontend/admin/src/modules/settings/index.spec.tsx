/**
 * @vitest-environment happy-dom
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const useAppConfigMock = vi.fn();

vi.mock('./use-app-config', () => ({
  useAppConfig: () => useAppConfigMock(),
}));

vi.mock('../header', () => ({
  Header: ({ title }: { title: string }) => <div>{title}</div>,
}));

vi.mock('./config-input-row', () => ({
  ConfigRow: ({
    field,
    defaultValue,
    onChange,
    onErrorChange,
  }: {
    field: string;
    defaultValue?: unknown;
    onChange?: (field: string, value: unknown) => void;
    onErrorChange?: (field: string, error?: string) => void;
  }) => (
    <div data-testid={`field-${field}`}>
      <div>{`${field}:${defaultValue}`}</div>
      <button type="button" onClick={() => onChange?.(field, 'embedded')}>
        set-embedded-{field}
      </button>
      <button type="button" onClick={() => onChange?.(field, 'elasticsearch')}>
        set-elasticsearch-{field}
      </button>
      <button
        type="button"
        onClick={() => {
          onErrorChange?.(field, 'Invalid JSON format');
        }}
      >
        mark-error-{field}
      </button>
      <button
        type="button"
        onClick={() => {
          onErrorChange?.(field, undefined);
        }}
      >
        clear-error-{field}
      </button>
    </div>
  ),
}));

vi.mock('./config', () => ({
  ALL_CONFIG_DESCRIPTORS: {
    server: {
      name: {
        desc: 'Server Name',
        type: 'String',
      },
    },
    auth: {
      allowSignup: {
        desc: 'Allow Signup',
        type: 'Boolean',
      },
    },
    indexer: {
      'provider.type': {
        desc: 'Provider',
        type: 'String',
      },
      'provider.endpoint': {
        desc: 'Endpoint',
        type: 'String',
      },
    },
  },
  ALL_SETTING_GROUPS: [
    {
      name: 'Server',
      module: 'server',
      fields: ['name'],
    },
    {
      name: 'Auth',
      module: 'auth',
      fields: ['allowSignup'],
    },
    {
      name: 'Indexer',
      module: 'indexer',
      fields: [
        {
          key: 'provider.type',
          type: 'Enum',
          options: ['embedded', 'elasticsearch', 'manticoresearch'],
        },
        'provider.endpoint',
      ],
    },
  ],
}));

import { SettingsPage } from './index';

describe('SettingsPage', () => {
  beforeEach(() => {
    useAppConfigMock.mockReset();
    useAppConfigMock.mockReturnValue({
      appConfig: {
        server: {
          name: 'AFFiNE',
        },
        auth: {
          allowSignup: true,
        },
        indexer: {
          enabled: false,
          provider: {
            type: 'elasticsearch',
            endpoint: 'http://search.example',
          },
        },
      },
      patchedAppConfig: {
        server: {
          name: 'AFFiNE',
        },
        auth: {
          allowSignup: true,
        },
        indexer: {
          enabled: false,
          provider: {
            type: 'elasticsearch',
            endpoint: 'http://search.example',
          },
        },
      },
      update: vi.fn(),
      saveGroup: vi.fn().mockResolvedValue(undefined),
      resetGroup: vi.fn(),
      isGroupDirty: vi.fn().mockReturnValue(false),
      isGroupSaving: vi.fn().mockReturnValue(false),
      getGroupVersion: vi.fn().mockReturnValue(0),
    });
  });

  afterEach(() => {
    cleanup();
  });

  test('keeps all groups collapsed by default', () => {
    render(
      <MemoryRouter initialEntries={['/admin/settings']}>
        <Routes>
          <Route path="/admin/settings" element={<SettingsPage />} />
        </Routes>
      </MemoryRouter>
    );

    const serverItem = document.getElementById('config-module-server');
    const authItem = document.getElementById('config-module-auth');
    expect(serverItem?.dataset.state).toBe('closed');
    expect(authItem?.dataset.state).toBe('closed');
  });

  test('keeps previous group open when another group is expanded', () => {
    render(
      <MemoryRouter initialEntries={['/admin/settings']}>
        <Routes>
          <Route path="/admin/settings" element={<SettingsPage />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(screen.getAllByRole('button', { name: /Server/i })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: /Auth/i })[0]);

    const serverItem = document.getElementById('config-module-server');
    const authItem = document.getElementById('config-module-auth');
    expect(serverItem?.dataset.state).toBe('open');
    expect(authItem?.dataset.state).toBe('open');
  });

  test('enables the selected provider without replacing external settings', () => {
    const update = vi.fn();
    useAppConfigMock.mockReturnValue({
      ...useAppConfigMock(),
      update,
    });
    render(
      <MemoryRouter initialEntries={['/admin/settings']}>
        <Routes>
          <Route path="/admin/settings" element={<SettingsPage />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(screen.getAllByRole('button', { name: /Indexer/i })[0]);
    expect(
      screen.getByText('indexer/provider.type:elasticsearch')
    ).toBeTruthy();
    expect(screen.getByTestId('field-indexer/provider.endpoint')).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', {
        name: 'set-embedded-indexer/provider.type',
      })
    );
    expect(update).toHaveBeenCalledWith('indexer/enabled', true);
    expect(update).toHaveBeenCalledWith('indexer/provider.type', 'embedded');

    fireEvent.click(
      screen.getByRole('button', {
        name: 'set-elasticsearch-indexer/provider.type',
      })
    );
    expect(update).toHaveBeenCalledWith('indexer/enabled', true);
    expect(update).toHaveBeenCalledWith(
      'indexer/provider.type',
      'elasticsearch'
    );
  });

  test('disables save when group has validation errors even if group is dirty', () => {
    useAppConfigMock.mockReset();
    useAppConfigMock.mockReturnValue({
      appConfig: {
        server: {
          name: 'AFFiNE',
        },
        auth: {
          allowSignup: true,
        },
      },
      patchedAppConfig: {
        server: {
          name: 'AFFiNE',
        },
        auth: {
          allowSignup: true,
        },
      },
      update: vi.fn(),
      saveGroup: vi.fn().mockResolvedValue(undefined),
      resetGroup: vi.fn(),
      isGroupDirty: vi
        .fn()
        .mockImplementation((module: string) => module === 'server'),
      isGroupSaving: vi.fn().mockReturnValue(false),
      getGroupVersion: vi.fn().mockReturnValue(0),
    });

    render(
      <MemoryRouter initialEntries={['/admin/settings']}>
        <Routes>
          <Route path="/admin/settings" element={<SettingsPage />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(screen.getAllByRole('button', { name: /Server/i })[0]);

    const serverItem = document.getElementById('config-module-server');
    expect(serverItem).not.toBeNull();
    if (!serverItem) {
      return;
    }

    const saveButton = within(serverItem).getByRole('button', { name: 'Save' });
    expect(saveButton.hasAttribute('disabled')).toBe(false);

    fireEvent.click(
      within(serverItem).getByRole('button', {
        name: 'mark-error-server/name',
      })
    );

    expect(saveButton.hasAttribute('disabled')).toBe(true);

    fireEvent.click(
      within(serverItem).getByRole('button', {
        name: 'clear-error-server/name',
      })
    );

    expect(saveButton.hasAttribute('disabled')).toBe(false);
  });
});
