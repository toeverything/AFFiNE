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
    onErrorChange,
  }: {
    field: string;
    onErrorChange?: (field: string, error?: string) => void;
  }) => (
    <div data-testid={`field-${field}`}>
      <div>{field}</div>
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
