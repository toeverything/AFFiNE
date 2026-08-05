/**
 * @vitest-environment happy-dom
 */

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type {
  ButtonHTMLAttributes,
  ChangeEvent,
  InputHTMLAttributes,
  ReactNode,
} from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';

const ByokProvider = vi.hoisted(() => ({
  openai: 'openai',
  anthropic: 'anthropic',
  gemini: 'gemini',
  fal: 'fal',
}));
const createMutation = vi.hoisted(() => Symbol('create'));
const probeMutation = vi.hoisted(() => Symbol('probe'));
const replaceMutation = vi.hoisted(() => Symbol('replace'));

vi.mock('@affine/component', () => ({
  Button: ({
    children,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) => (
    <button {...props}>{children}</button>
  ),
  Input: ({
    onChange,
    size: _size,
    ...props
  }: Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'size'> & {
    onChange?: (value: string) => void;
    size?: string;
  }) => (
    <input
      {...props}
      onChange={event => onChange?.(event.currentTarget.value)}
    />
  ),
  Checkbox: ({
    checked,
    onChange,
    label,
    name,
    'aria-label': ariaLabel,
  }: {
    checked: boolean;
    onChange?: (event: ChangeEvent<HTMLInputElement>, checked: boolean) => void;
    label?: string;
    name?: string;
    'aria-label'?: string;
  }) => (
    <span>
      <input
        aria-label={ariaLabel ?? label}
        name={name}
        type="checkbox"
        checked={checked}
        onChange={event => onChange?.(event, event.currentTarget.checked)}
      />
      {label}
    </span>
  ),
  Modal: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div role="dialog">{children}</div> : null,
  Switch: ({
    checked,
    onChange,
    ...props
  }: {
    checked: boolean;
    onChange: (checked: boolean) => void;
    'aria-label'?: string;
  }) => (
    <input
      {...props}
      type="checkbox"
      checked={checked}
      onChange={event => onChange(event.currentTarget.checked)}
    />
  ),
  DragHandle: () => <span>drag</span>,
  IconButton: ({ title, onClick }: { title: string; onClick?: () => void }) => (
    <button onClick={onClick}>{title}</button>
  ),
  Menu: ({ children, items }: { children: ReactNode; items: ReactNode }) => (
    <div>
      {children}
      {items}
    </div>
  ),
  MenuItem: ({
    children,
    disabled,
    onSelect,
  }: {
    children: ReactNode;
    disabled?: boolean;
    onSelect?: () => void;
  }) => (
    <button disabled={disabled} onClick={onSelect}>
      {children}
    </button>
  ),
  notify: { error: vi.fn() },
}));

vi.mock('@affine/graphql', () => ({
  ByokProvider,
  createWorkspaceByokProfileMutation: createMutation,
  probeWorkspaceByokDraftMutation: probeMutation,
  replaceWorkspaceByokProfileMutation: replaceMutation,
}));

vi.mock('@affine/i18n', () => ({
  useI18n: () => ({ t: (key: string) => key.split('.').at(-1) ?? key }),
}));

import { AddKeyModal } from './add-key-modal';
import { endpointHintKey } from './metadata';

const textCapability = {
  input: ['text'],
  output: ['text'],
  features: [],
  attachmentKinds: [],
  attachmentSources: [],
};

function settings(customEndpointSupported = true) {
  return {
    workspaceId: 'workspace-1',
    entitled: true,
    serverEntitled: true,
    localEntitled: false,
    allowedProviders: Object.values(ByokProvider),
    customEndpointSupported,
    privateEndpointSupported: false,
    localStorageSupported: false,
    keys: [],
    catalog: {
      version: 'catalog-1',
      providers: [
        {
          provider: ByokProvider.openai,
          models: [
            {
              modelId: 'model-a',
              displayName: 'Model A',
              recommended: true,
              capabilities: [textCapability],
            },
            {
              modelId: 'model-b',
              displayName: 'Model B',
              recommended: false,
              capabilities: [textCapability],
            },
          ],
        },
      ],
    },
  };
}

describe('BYOK settings behavior', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  test.each([
    [false, false, 'endpoint.custom-disabled'],
    [true, false, 'endpoint.private-disabled'],
    [true, true, null],
  ] as const)(
    'maps endpoint policy custom=%s private=%s',
    (customEndpointSupported, privateEndpointSupported, expected) => {
      expect(
        endpointHintKey(customEndpointSupported, privateEndpointSupported)
      ).toBe(expected);
    }
  );

  test('shows a disabled custom endpoint control with its self-hosted policy hint', () => {
    const props = {
      workspaceId: 'workspace-1',
      settings: settings(false) as never,
      editingKey: null,
      open: true,
      onOpenChange: vi.fn(),
      onSaved: vi.fn(),
      localKeys: [],
      setLocalKeys: vi.fn(),
      localStorageSupported: false,
      canAddServerKey: true,
      canAddLocalKey: false,
      gql: vi.fn() as never,
    };
    const { rerender } = render(<AddKeyModal {...props} isSelfHosted />);

    expect(
      (
        screen.getByRole('checkbox', {
          name: 'use-custom',
        }) as HTMLInputElement
      ).disabled
    ).toBe(true);
    expect(screen.getByText('custom-disabled')).toBeTruthy();

    rerender(<AddKeyModal {...props} isSelfHosted={false} />);
    expect(screen.queryByRole('checkbox', { name: 'use-custom' })).toBeNull();
    expect(screen.queryByText('custom-disabled')).toBeNull();
  });

  test('shows selected models separately and adds catalog or custom models', () => {
    render(
      <AddKeyModal
        workspaceId="workspace-1"
        settings={settings() as never}
        editingKey={null}
        open
        onOpenChange={vi.fn()}
        onSaved={vi.fn()}
        localKeys={[]}
        setLocalKeys={vi.fn()}
        localStorageSupported={false}
        canAddServerKey
        canAddLocalKey={false}
        isSelfHosted={false}
        gql={vi.fn() as never}
      />
    );

    expect(screen.getByText('Model A')).toBeTruthy();
    expect(screen.queryByText('Model B')).toBeNull();
    expect(
      (screen.getByRole('radio', { name: /local/i }) as HTMLInputElement)
        .disabled
    ).toBe(true);
    expect(screen.getByText('desktop-only')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'add-model' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Model B/ }));
    fireEvent.click(
      screen.getByRole('button', { name: 'add-selected-models' })
    );
    expect(screen.getByText('Model B')).toBeTruthy();

    const modelBRow = screen.getByText('Model B').closest('li')!;
    fireEvent.click(within(modelBRow).getByRole('button', { name: 'move-up' }));
    expect(
      [...screen.getByRole('list').querySelectorAll('strong')].map(
        element => element.textContent
      )
    ).toEqual(['Model B', 'Model A']);
    const reorderedModelBRow = screen.getByText('Model B').closest('li')!;
    fireEvent.click(
      within(reorderedModelBRow).getByRole('checkbox', {
        name: 'disable-model',
      })
    );
    expect(
      within(screen.getByText('Model B').closest('li')!).getByText('disabled')
    ).toBeTruthy();

    fireEvent.click(screen.getByText('use-custom'));
    expect(screen.queryByText('Model A')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'add-model' }));
    const modelId = screen.getByPlaceholderText('model-id');
    fireEvent.change(modelId, { target: { value: 'custom-chat' } });
    const modelDialog = screen.getAllByRole('dialog').at(-1)!;
    fireEvent.click(
      within(modelDialog).getByRole('button', { name: 'add-model' })
    );

    expect(screen.getByText('custom-chat')).toBeTruthy();
  });

  test('requires model verification before saving the selected models', async () => {
    type MockOperation = {
      query: symbol;
      variables?: {
        input?: { definition?: { models?: unknown[] } };
      };
    };
    let probePasses = false;
    const gql = vi.fn(async ({ query }: MockOperation) => {
      if (query === probeMutation) {
        return {
          probeWorkspaceByokDraft: {
            definitionFingerprint: 'fingerprint',
            stale: false,
            connection: { kind: 'verified' },
            models: [
              {
                modelId: 'model-a',
                checks: [
                  {
                    operation: 'chat',
                    status: { kind: probePasses ? 'verified' : 'failed' },
                  },
                ],
              },
            ],
          },
        };
      }
      if (query === createMutation) {
        return { createWorkspaceByokProfile: { profileId: 'profile-1' } };
      }
      throw new Error('Unexpected GraphQL operation');
    });
    render(
      <AddKeyModal
        workspaceId="workspace-1"
        settings={settings() as never}
        editingKey={null}
        open
        onOpenChange={vi.fn()}
        onSaved={vi.fn()}
        localKeys={[]}
        setLocalKeys={vi.fn()}
        localStorageSupported={false}
        canAddServerKey
        canAddLocalKey={false}
        isSelfHosted={false}
        gql={gql as never}
      />
    );

    fireEvent.change(document.querySelector('input[type="password"]')!, {
      target: { value: 'secret' },
    });
    fireEvent.click(screen.getByText('connect'));

    await waitFor(() => expect(gql).toHaveBeenCalledTimes(1));
    expect(gql.mock.calls.some(call => call[0].query === createMutation)).toBe(
      false
    );

    probePasses = true;
    fireEvent.click(screen.getByText('connect'));
    await waitFor(() => expect(gql).toHaveBeenCalledTimes(3));
    const createCall = gql.mock.calls.find(
      call => call[0].query === createMutation
    );
    expect(createCall?.[0].variables?.input?.definition?.models).toEqual([
      {
        modelId: 'model-a',
        enabled: true,
        capabilities: [textCapability],
      },
    ]);
  });

  test('does not accept a verified connection when no model check ran', async () => {
    type MockOperation = {
      query: symbol;
      variables?: { input?: { checks?: unknown[] } };
    };
    const gql = vi.fn(async ({ query }: MockOperation) => {
      if (query === probeMutation) {
        return {
          probeWorkspaceByokDraft: {
            definitionFingerprint: 'fingerprint',
            stale: false,
            connection: { kind: 'verified' },
            models: [],
          },
        };
      }
      if (query === createMutation) {
        return { createWorkspaceByokProfile: { profileId: 'profile-1' } };
      }
      throw new Error('Unexpected GraphQL operation');
    });
    render(
      <AddKeyModal
        workspaceId="workspace-1"
        settings={settings() as never}
        editingKey={null}
        open
        onOpenChange={vi.fn()}
        onSaved={vi.fn()}
        localKeys={[]}
        setLocalKeys={vi.fn()}
        localStorageSupported={false}
        canAddServerKey
        canAddLocalKey={false}
        isSelfHosted={false}
        gql={gql as never}
      />
    );

    fireEvent.change(document.querySelector('input[type="password"]')!, {
      target: { value: 'secret' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'disable-model' }));
    fireEvent.click(screen.getByText('connect'));

    await waitFor(() => expect(screen.getByText('failed')).toBeTruthy());

    const probeCall = gql.mock.calls.find(
      ([operation]) => operation.query === probeMutation
    );
    expect(probeCall?.[0].variables?.input?.checks).toEqual([]);
    expect(
      gql.mock.calls.some(([operation]) => operation.query === createMutation)
    ).toBe(false);
  });

  test('preserves definition version and server revision while editing', async () => {
    type MockOperation = {
      query: symbol;
      variables?: { input?: Record<string, unknown> };
    };
    const gql = vi.fn(async ({ query }: MockOperation) => {
      if (query === probeMutation) {
        return {
          probeWorkspaceByokDraft: {
            definitionFingerprint: 'fingerprint',
            stale: false,
            connection: { kind: 'verified' },
            models: [
              {
                modelId: 'model-a',
                checks: [{ operation: 'chat', status: { kind: 'verified' } }],
              },
            ],
          },
        };
      }
      if (query === replaceMutation) {
        return { replaceWorkspaceByokProfile: { profileId: 'profile-1' } };
      }
      throw new Error('Unexpected GraphQL operation');
    });
    render(
      <AddKeyModal
        workspaceId="workspace-1"
        settings={settings() as never}
        editingKey={
          {
            id: 'profile-1',
            provider: ByokProvider.openai,
            name: 'OpenAI',
            storage: 'server',
            configured: true,
            enabled: true,
            sortOrder: 0,
            revision: 7,
            definition: {
              version: 3,
              endpoint: { kind: 'provider_default', url: null },
              models: [
                {
                  modelId: 'model-a',
                  enabled: true,
                  capabilities: [textCapability],
                },
              ],
            },
            capabilities: ['Text'],
          } as never
        }
        open
        onOpenChange={vi.fn()}
        onSaved={vi.fn()}
        localKeys={[]}
        setLocalKeys={vi.fn()}
        localStorageSupported={false}
        canAddServerKey
        canAddLocalKey={false}
        isSelfHosted={false}
        gql={gql as never}
      />
    );

    fireEvent.click(screen.getByText('save-changes'));
    await waitFor(() => expect(gql).toHaveBeenCalledTimes(2));
    const replaceCall = gql.mock.calls.find(
      call => call[0].query === replaceMutation
    );
    expect(replaceCall?.[0].variables?.input).toMatchObject({
      expectedRevision: 7,
      definition: { version: 3 },
    });
  });
});
