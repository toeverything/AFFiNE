/**
 * @vitest-environment happy-dom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  remove: vi.fn(),
  rotate: vi.fn(),
}));

vi.mock('@affine/admin/use-query', () => ({
  useQuery: () => ({
    data: {
      authSigningKeys: [
        {
          id: 'active-key',
          status: 'active',
          source: 'auto',
          createdAt: '2026-01-01T00:00:00.000Z',
          retiredAt: null,
          verifyUntil: null,
          canDelete: false,
        },
        {
          id: 'expired-key',
          status: 'retiring',
          source: 'admin',
          createdAt: '2025-01-01T00:00:00.000Z',
          retiredAt: '2025-01-02T00:00:00.000Z',
          verifyUntil: '2025-01-02T01:00:00.000Z',
          canDelete: true,
        },
      ],
    },
    mutate: mocks.mutate,
  }),
}));

vi.mock('@affine/admin/use-mutation', () => ({
  useMutation: ({ mutation }: { mutation: { id: string } }) => ({
    trigger:
      mutation.id === 'rotateAuthSigningKeyMutation'
        ? mocks.rotate
        : mocks.remove,
    isMutating: false,
  }),
}));

vi.mock('../../../components/shared/confirm-dialog', () => ({
  ConfirmDialog: ({
    open,
    onConfirm,
  }: {
    open: boolean;
    onConfirm: () => void;
  }) => (open ? <button onClick={onConfirm}>confirm-action</button> : null),
}));

vi.mock('@affine/component', () => ({
  notify: { error: vi.fn(), success: vi.fn() },
}));

import { AuthSigningKeys } from './auth-signing-keys';

describe('AuthSigningKeys', () => {
  beforeEach(() => {
    mocks.mutate.mockReset().mockResolvedValue(undefined);
    mocks.remove.mockReset().mockResolvedValue({});
    mocks.rotate.mockReset().mockResolvedValue({});
  });

  afterEach(cleanup);

  test('rotates the active key and deletes only an expired key', async () => {
    render(<AuthSigningKeys />);

    expect(screen.queryByText(/secret/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Rotate key' }));
    fireEvent.click(screen.getByRole('button', { name: 'confirm-action' }));
    await vi.waitFor(() =>
      expect(mocks.rotate).toHaveBeenCalledWith({
        expectedActiveKeyId: 'active-key',
      })
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'confirm-action' }));
    await vi.waitFor(() =>
      expect(mocks.remove).toHaveBeenCalledWith({ id: 'expired-key' })
    );
    expect(mocks.mutate).toHaveBeenCalledTimes(2);
  });
});
