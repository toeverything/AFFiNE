/**
 * @vitest-environment happy-dom
 */
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { CustomIconPicker } from './custom-icon-picker';
import type * as ImageUtils from './image';
import { resizeImage } from './image';

vi.mock('@affine/i18n', () => ({
  useI18n: () => new Proxy({}, { get: (_, key) => () => String(key) }),
}));

vi.mock('./image', async importOriginal => ({
  ...(await importOriginal<typeof ImageUtils>()),
  resizeImage: vi.fn(),
}));

beforeEach(() => {
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.mocked(resizeImage).mockReset();
});

describe('CustomIconPicker', () => {
  test('ignores image processing that completes after unmount', async () => {
    const pending = Promise.withResolvers<Blob>();
    vi.mocked(resizeImage).mockReturnValue(pending.promise);
    const onSelect = vi.fn();
    const { container, unmount } = render(
      <CustomIconPicker onSelect={onSelect} />
    );
    const input = container.querySelector('input')!;
    fireEvent.change(input, {
      target: {
        files: [new File(['image'], 'icon.png', { type: 'image/png' })],
      },
    });
    expect(resizeImage).toHaveBeenCalledOnce();

    unmount();
    await act(async () => pending.resolve(new Blob(['processed'])));

    expect(onSelect).not.toHaveBeenCalled();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  test('keeps the latest selection when image processing finishes out of order', async () => {
    const first = Promise.withResolvers<Blob>();
    const second = Promise.withResolvers<Blob>();
    vi.mocked(resizeImage)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const onSelect = vi.fn();
    const { container } = render(<CustomIconPicker onSelect={onSelect} />);
    const input = container.querySelector('input')!;
    for (const name of ['first.png', 'second.png']) {
      fireEvent.change(input, {
        target: { files: [new File(['image'], name, { type: 'image/png' })] },
      });
    }

    const latest = new Blob(['second']);
    await act(async () => second.resolve(latest));
    await act(async () => first.resolve(new Blob(['first'])));

    expect(onSelect).toHaveBeenCalledExactlyOnceWith(latest);
    expect(URL.createObjectURL).toHaveBeenCalledExactlyOnceWith(latest);
  });

  test('releases the preview URL on unmount', async () => {
    vi.mocked(resizeImage).mockResolvedValue(new Blob(['processed']));
    const { container, unmount } = render(
      <CustomIconPicker onSelect={vi.fn()} />
    );
    await act(async () => {
      fireEvent.change(container.querySelector('input')!, {
        target: {
          files: [new File(['image'], 'icon.png', { type: 'image/png' })],
        },
      });
    });
    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      'blob:preview'
    );

    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:preview');
  });
});
