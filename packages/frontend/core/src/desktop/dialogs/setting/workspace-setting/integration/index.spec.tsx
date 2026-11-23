/**
 * @vitest-environment happy-dom
 */

import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const workspaceInfoState = vi.hoisted(() => ({
  info: {
    isOwner: false,
    isAdmin: false,
    isTeam: false,
  },
}));
const workspaceState = vi.hoisted(() => ({
  id: 'workspace-1',
  flavour: 'affine',
}));
const serverFeatures = vi.hoisted(() => ({ copilot: true }));

const WorkspaceServiceToken = vi.hoisted(() => class WorkspaceService {});
const ServerServiceToken = vi.hoisted(() => class ServerService {});

vi.mock('@affine/component/setting-components', () => ({
  SettingHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

vi.mock('@affine/core/components/hooks/use-workspace-info', () => ({
  useWorkspaceInfo: () => workspaceInfoState.info,
}));

vi.mock('@affine/core/modules/integration', () => ({
  IntegrationTypeIcon: () => null,
}));

vi.mock('@affine/core/modules/workspace', () => ({
  WorkspaceService: WorkspaceServiceToken,
}));

vi.mock('@affine/core/modules/cloud', () => ({
  ServerService: ServerServiceToken,
}));

vi.mock('@affine/i18n', () => {
  const messages: Record<string, string> = {
    'com.affine.integration.integrations': 'Integrations',
    'com.affine.integration.setting.description': 'Integration settings',
    'com.affine.settings.workspace.byok.title': 'AI BYOK',
    'com.affine.settings.workspace.byok.subtitle':
      'Use your own provider keys for this workspace.',
  };
  const translate = (key: string) => messages[key] ?? key;
  return {
    useI18n: () =>
      new Proxy(
        {
          t: translate,
        },
        {
          get: (target, key: string) => {
            if (key in target) {
              return target[key as keyof typeof target];
            }
            return () => translate(key);
          },
        }
      ),
  };
});

vi.mock('@blocksuite/icons/rc', () => ({
  AiIcon: () => null,
  Logo1Icon: () => null,
  TodayIcon: () => null,
}));

vi.mock('@toeverything/infra', () => ({
  useLiveData: () => serverFeatures,
  useService: (token: unknown) => {
    if (token === WorkspaceServiceToken) {
      return {
        workspace: workspaceState,
      };
    }
    if (token === ServerServiceToken) {
      return { server: { features$: serverFeatures } };
    }
    return {};
  },
}));

vi.mock('../byok', () => ({
  WorkspaceByokSetting: () => null,
}));

vi.mock('../../sub-page', () => ({
  SubPageProvider: ({ children }: { children: ReactNode }) => children,
  useSubPageIsland: () => null,
}));

vi.mock('./calendar/setting-panel', () => ({
  CalendarSettingPanel: () => null,
}));

vi.mock('./mcp-server/setting-panel', () => ({
  McpServerSettingPanel: () => null,
}));

vi.mock('./readwise/setting-panel', () => ({
  ReadwiseSettingPanel: () => null,
}));

import { IntegrationSetting } from '.';

describe('IntegrationSetting', () => {
  beforeEach(() => {
    workspaceInfoState.info = {
      isOwner: false,
      isAdmin: false,
      isTeam: false,
    };
    workspaceState.flavour = 'affine';
    serverFeatures.copilot = true;
  });

  afterEach(() => {
    cleanup();
  });

  const byokVisibilityCases = [
    {
      name: 'ordinary members',
      info: { isOwner: false, isAdmin: false, isTeam: false },
      visible: false,
    },
    {
      name: 'owners',
      info: { isOwner: true, isAdmin: false, isTeam: false },
      visible: true,
    },
    {
      name: 'admins in personal workspaces',
      info: { isOwner: false, isAdmin: true, isTeam: false },
      visible: true,
    },
    {
      name: 'admins in team workspaces',
      info: { isOwner: false, isAdmin: true, isTeam: true },
      visible: true,
    },
  ];

  for (const testCase of byokVisibilityCases) {
    test(`shows BYOK integration for ${testCase.name}`, () => {
      workspaceInfoState.info = testCase.info;
      render(<IntegrationSetting />);

      if (testCase.visible) {
        expect(screen.getByText('AI BYOK')).not.toBeNull();
      } else {
        expect(screen.queryByText('AI BYOK')).toBeNull();
      }
    });
  }

  test('hides MCP Server when Copilot is disabled', () => {
    serverFeatures.copilot = false;
    render(<IntegrationSetting />);

    expect(
      screen.queryByText('com.affine.integration.mcp-server.name')
    ).toBeNull();
  });

  test('shows MCP Server when Copilot is enabled', () => {
    render(<IntegrationSetting />);

    expect(
      screen.getByText('com.affine.integration.mcp-server.name')
    ).not.toBeNull();
  });
});
