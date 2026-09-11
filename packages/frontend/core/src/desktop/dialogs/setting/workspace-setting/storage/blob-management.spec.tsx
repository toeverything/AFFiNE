/** @vitest-environment happy-dom */

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type * as Infra from '@toeverything/infra';
import type { MouseEventHandler, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const openConfirmModal = vi.hoisted(() => vi.fn());
const deleteBlob = vi.hoisted(() =>
  vi.fn(async (_key: string, _permanent: boolean) => undefined)
);
const revalidate = vi.hoisted(() => vi.fn());
const notifyError = vi.hoisted(() => vi.fn());
const blobManagementServiceToken = vi.hoisted(
  () => class BlobManagementService {}
);
const blobs = vi.hoisted(() =>
  Array.from({ length: 10 }, (_, index) => ({
    key: `blob-${index + 1}`,
    mime: 'image/png',
    size: 1024,
  }))
);

vi.mock('@affine/component', () => ({
  Button: ({
    children,
    disabled,
    onClick,
  }: {
    children: ReactNode;
    disabled?: boolean;
    onClick?: MouseEventHandler<HTMLButtonElement>;
  }) => (
    <button disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
  Checkbox: ({ checked }: { checked: boolean }) => (
    <input type="checkbox" checked={checked} readOnly />
  ),
  Loading: () => <div>Loading</div>,
  notify: { error: notifyError },
  templateToString: (value: string) => value,
  useConfirmModal: () => ({ openConfirmModal }),
}));

vi.mock('@affine/component/setting-components', () => ({
  Pagination: () => <div>Pagination</div>,
}));

vi.mock('@affine/core/modules/blob-management/services', () => ({
  BlobManagementService: blobManagementServiceToken,
}));

vi.mock('@affine/i18n', () => ({
  useI18n: () =>
    new Proxy(
      {},
      {
        get: (_, key: string) => (args?: { count?: string }) => {
          const translations: Record<string, string> = {
            'com.affine.keyboardShortcuts.selectAll': 'Select all',
            'com.affine.settings.workspace.storage.unused-blobs':
              'Unused blobs',
            'com.affine.settings.workspace.storage.unused-blobs.empty':
              'No unused blobs',
            'com.affine.settings.workspace.storage.unused-blobs.selected':
              'Selected',
            'com.affine.settings.workspace.storage.unused-blobs.delete.title':
              'Delete blob files',
            'com.affine.settings.workspace.storage.unused-blobs.delete.warning':
              'Delete these blobs?',
            'com.affine.settings.workspace.storage.unused-blobs.delete.failed':
              'Delete failed',
            Delete: 'Delete',
            Cancel: 'Cancel',
          };
          return (translations[key] ?? key).replace(
            '{{count}}',
            String(args?.count ?? '')
          );
        },
      }
    ),
}));

vi.mock('@affine/track', () => ({
  default: {
    $: {
      settingsPanel: {
        workspace: { deleteUnusedBlob: vi.fn() },
      },
    },
  },
}));

vi.mock('@blocksuite/affine/components/icons', () => ({
  getAttachmentFileIcon: () => '<svg></svg>',
}));

vi.mock('@blocksuite/icons/rc', () => ({
  DeleteIcon: () => <span>Delete icon</span>,
}));

vi.mock('@toeverything/infra', async importOriginal => {
  const actual = await importOriginal<typeof Infra>();
  const unusedBlobs = {
    unusedBlobs$: { value: blobs },
    isLoading$: { value: false },
    deleteBlob,
    revalidate,
  };

  return {
    ...actual,
    useLiveData: (liveData: { value: unknown }) => liveData.value,
    useService: () => ({ unusedBlobs }),
  };
});

import { BlobManagementPanel } from './blob-management';

describe('BlobManagementPanel', () => {
  beforeEach(() => {
    openConfirmModal.mockReset();
    deleteBlob.mockReset();
    deleteBlob.mockResolvedValue(undefined);
    revalidate.mockClear();
    notifyError.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  test('selects and deletes unused blobs across every page', async () => {
    render(<BlobManagementPanel />);

    await waitFor(() => {
      expect(screen.getAllByTestId('blob-preview-card')).toHaveLength(9);
    });

    fireEvent.click(screen.getAllByTestId('blob-preview-card')[0]);
    expect(screen.getByText('1 Selected')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Select all (10)' }));
    expect(screen.getByText('10 Selected')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(openConfirmModal).toHaveBeenCalledOnce();
    expect(openConfirmModal.mock.calls[0][0].title).toBe(
      'Delete blob files (10)'
    );
    expect(openConfirmModal.mock.calls[0][0].children).toBe(
      'Delete these blobs?'
    );

    await act(async () => {
      await openConfirmModal.mock.calls[0][0].onConfirm();
    });

    expect(deleteBlob).toHaveBeenCalledTimes(10);
    expect(deleteBlob.mock.calls.map(call => call[0])).toEqual(
      blobs.map(blob => blob.key)
    );
    expect(screen.getByText('Unused blobs (0)')).toBeTruthy();
  });

  test('keeps failed deletions selected', async () => {
    deleteBlob.mockImplementation(async key => {
      if (key === 'blob-3') {
        throw new Error('Delete failed');
      }
    });
    render(<BlobManagementPanel />);

    await waitFor(() => {
      expect(screen.getAllByTestId('blob-preview-card')).toHaveLength(9);
    });

    fireEvent.click(screen.getAllByTestId('blob-preview-card')[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Select all (10)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await act(async () => {
      await openConfirmModal.mock.calls[0][0].onConfirm();
    });

    expect(screen.getByText('1 Selected')).toBeTruthy();
    expect(screen.getAllByTestId('blob-preview-card')).toHaveLength(1);
    expect(screen.getByRole('checkbox')).toHaveProperty('checked', true);
    expect(notifyError).toHaveBeenCalledOnce();
  });
});
