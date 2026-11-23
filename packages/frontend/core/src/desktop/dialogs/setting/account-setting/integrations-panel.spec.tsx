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
import type { InputHTMLAttributes, MouseEventHandler, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const gqlMock = vi.hoisted(() => vi.fn());
const openExternal = vi.hoisted(() => vi.fn());
const mutateAccounts = vi.hoisted(() => vi.fn(async () => undefined));
const mutateProviders = vi.hoisted(() => vi.fn(async () => undefined));
const workspaceState = vi.hoisted(() => ({
  flavour: 'cloud',
}));
const queryState = vi.hoisted(() => ({
  accounts: [] as {
    id: string;
    provider: string;
    displayName: string | null;
    email: string | null;
    calendarsCount: number;
    status: string;
    lastError: string | null;
  }[],
  providers: [] as string[],
  caldavProviders: [] as {
    id: string;
    label: string;
    docsUrl?: string | null;
    requiresAppPassword?: boolean;
  }[],
}));
const GraphQLServiceToken = vi.hoisted(() => class GraphQLService {});
const UrlServiceToken = vi.hoisted(() => class UrlService {});
const WorkspaceServiceToken = vi.hoisted(() => class WorkspaceService {});

const CalendarProviderType = vi.hoisted(
  () =>
    ({
      Google: 'Google',
      CalDAV: 'CalDAV',
    }) as const
);

const calendarAccountsQuery = vi.hoisted(() => Symbol('calendarAccountsQuery'));
const calendarProvidersQuery = vi.hoisted(() =>
  Symbol('calendarProvidersQuery')
);
const linkCalendarAccountMutation = vi.hoisted(() =>
  Symbol('linkCalendarAccountMutation')
);
const unlinkCalendarAccountMutation = vi.hoisted(() =>
  Symbol('unlinkCalendarAccountMutation')
);
const linkCalDavAccountMutation = vi.hoisted(() =>
  Symbol('linkCalDavAccountMutation')
);

vi.mock('@affine/component', () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: ReactNode;
    onClick?: MouseEventHandler<HTMLButtonElement>;
    disabled?: boolean;
  }) => (
    <button disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
  Input: (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  Loading: () => <div>loading</div>,
  Menu: ({ children, items }: { children: ReactNode; items: ReactNode }) => (
    <div>
      {children}
      <div>{items}</div>
    </div>
  ),
  MenuItem: ({
    children,
    onSelect,
  }: {
    children: ReactNode;
    onSelect?: () => void;
  }) => <button onClick={onSelect}>{children}</button>,
  Modal: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div>{children}</div> : null,
  notify: {
    error: vi.fn(),
  },
}));

vi.mock('@affine/core/components/hooks/use-query', () => ({
  useQuery: ({ query }: { query: symbol }) => {
    if (query === calendarAccountsQuery) {
      return {
        data: {
          currentUser: {
            calendarAccounts: queryState.accounts,
          },
        },
        isLoading: false,
        mutate: mutateAccounts,
      };
    }

    return {
      data: {
        serverConfig: {
          calendarProviders: queryState.providers,
          calendarCalDAVProviders: queryState.caldavProviders,
        },
      },
      isLoading: false,
      mutate: mutateProviders,
    };
  },
}));

vi.mock('@affine/core/modules/cloud', () => ({
  GraphQLService: GraphQLServiceToken,
}));

vi.mock('@affine/core/modules/url', () => ({
  UrlService: UrlServiceToken,
}));

vi.mock('@affine/core/modules/workspace', () => ({
  WorkspaceService: WorkspaceServiceToken,
}));

vi.mock('@affine/graphql', () => ({
  calendarAccountsQuery,
  calendarProvidersQuery,
  CalendarProviderType,
  linkCalendarAccountMutation,
  unlinkCalendarAccountMutation,
  linkCalDavAccountMutation,
}));

vi.mock('@affine/i18n', () => ({
  useI18n: () =>
    new Proxy(
      {},
      {
        get: (_, key: string) => (args?: Record<string, string>) => {
          if (key === 'com.affine.integration.calendar.account.count') {
            return `${args?.count ?? '0'} calendars`;
          }
          return key;
        },
      }
    ),
}));

vi.mock('@blocksuite/icons/rc', () => ({
  GoogleIcon: () => <span>google-icon</span>,
  LinkIcon: () => <span>link-icon</span>,
  TodayIcon: () => <span>today-icon</span>,
}));

vi.mock('@toeverything/infra', async importOriginal => {
  const actual = await importOriginal<typeof Infra>();

  return {
    ...actual,
    useService: (token: unknown) => {
      if (token === GraphQLServiceToken) {
        return {
          gql: gqlMock,
        };
      }

      if (token === UrlServiceToken) {
        return {
          openExternal,
        };
      }

      if (token === WorkspaceServiceToken) {
        return {
          workspace: {
            flavour: workspaceState.flavour,
          },
        };
      }

      return {};
    },
  };
});

vi.mock('../layout', () => ({
  CollapsibleWrapper: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

import { IntegrationsPanel } from './integrations-panel';

describe('IntegrationsPanel', () => {
  beforeEach(() => {
    cleanup();
    gqlMock.mockReset();
    openExternal.mockReset();
    mutateAccounts.mockClear();
    mutateProviders.mockClear();
    workspaceState.flavour = 'cloud';
    queryState.accounts = [];
    queryState.providers = [];
    queryState.caldavProviders = [];
    window.history.replaceState({}, '', '/workspace/workspace-1/all');
  });

  afterEach(() => {
    cleanup();
  });

  test('opens calendar workspace settings from an account row in cloud workspaces', () => {
    queryState.accounts = [
      {
        id: 'account-1',
        provider: CalendarProviderType.Google,
        displayName: 'Alice',
        email: 'alice@example.com',
        calendarsCount: 2,
        status: 'active',
        lastError: null,
      },
    ];
    const onChangeSettingState = vi.fn();

    render(<IntegrationsPanel onChangeSettingState={onChangeSettingState} />);

    const row = screen.getByRole('button', { name: /Alice/i });
    fireEvent.click(row);
    fireEvent.keyDown(row, { key: 'Enter' });

    expect(onChangeSettingState).toHaveBeenNthCalledWith(1, {
      activeTab: 'workspace:integrations',
      scrollAnchor: 'integration-calendar',
    });
    expect(onChangeSettingState).toHaveBeenNthCalledWith(2, {
      activeTab: 'workspace:integrations',
      scrollAnchor: 'integration-calendar',
    });
  });

  test('does not expose account rows as buttons in local workspaces', () => {
    workspaceState.flavour = 'local';
    queryState.accounts = [
      {
        id: 'account-1',
        provider: CalendarProviderType.Google,
        displayName: 'Alice',
        email: 'alice@example.com',
        calendarsCount: 2,
        status: 'active',
        lastError: null,
      },
    ];
    const onChangeSettingState = vi.fn();

    render(<IntegrationsPanel onChangeSettingState={onChangeSettingState} />);

    expect(screen.queryByRole('button', { name: /Alice/i })).toBeNull();
    fireEvent.click(screen.getByText('Alice'));

    expect(onChangeSettingState).not.toHaveBeenCalled();
  });

  test('keeps the current page as oauth redirect in local workspaces', async () => {
    workspaceState.flavour = 'local';
    queryState.providers = [CalendarProviderType.Google];
    gqlMock.mockResolvedValue({
      linkCalendarAccount: 'https://calendar.example.com/oauth',
    });

    render(<IntegrationsPanel />);
    fireEvent.click(screen.getByText('Google Calendar'));

    await waitFor(() => {
      expect(gqlMock).toHaveBeenCalledWith({
        query: linkCalendarAccountMutation,
        variables: {
          input: {
            provider: CalendarProviderType.Google,
            redirectUri: window.location.href,
          },
        },
      });
    });
  });

  test('redirects oauth back to workspace integrations in cloud workspaces', async () => {
    queryState.providers = [CalendarProviderType.Google];
    gqlMock.mockResolvedValue({
      linkCalendarAccount: 'https://calendar.example.com/oauth',
    });
    const redirectUri = new URL(
      '/workspace/workspace-1/settings?tab=workspace%3Aintegrations&scrollAnchor=integration-calendar',
      window.location.origin
    ).toString();

    render(<IntegrationsPanel />);
    fireEvent.click(screen.getByText('Google Calendar'));

    await waitFor(() => {
      expect(gqlMock).toHaveBeenCalledWith({
        query: linkCalendarAccountMutation,
        variables: {
          input: {
            provider: CalendarProviderType.Google,
            redirectUri,
          },
        },
      });
    });
  });
});
