import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getImageFilesFromLocal,
  registerNativeImageFilesPicker,
} from '../../utils';

describe('getImageFilesFromLocal', () => {
  let originalShowPicker: ((this: HTMLInputElement) => void) | undefined;

  beforeEach(() => {
    originalShowPicker = (
      HTMLInputElement.prototype as HTMLInputElement & {
        showPicker?: (this: HTMLInputElement) => void;
      }
    ).showPicker;

    (
      HTMLInputElement.prototype as HTMLInputElement & {
        showPicker?: (this: HTMLInputElement) => void;
      }
    ).showPicker = vi.fn(function (this: HTMLInputElement) {
      this.dispatchEvent(new Event('cancel'));
    });
  });

  afterEach(() => {
    if (originalShowPicker) {
      (
        HTMLInputElement.prototype as HTMLInputElement & {
          showPicker?: (this: HTMLInputElement) => void;
        }
      ).showPicker = originalShowPicker;
    } else {
      delete (
        HTMLInputElement.prototype as unknown as {
          showPicker?: unknown;
        }
      ).showPicker;
    }

    registerNativeImageFilesPicker(null);
    vi.restoreAllMocks();
  });

  it('prefers the registered native image picker when available', async () => {
    const file = new File(['picked-image'], 'picked.png', {
      type: 'image/png',
      lastModified: 123,
    });
    const nativePicker = vi.fn(async () => [file]);
    registerNativeImageFilesPicker(nativePicker);

    const files = await getImageFilesFromLocal();

    expect(nativePicker).toHaveBeenCalledTimes(1);
    expect(files).toEqual([file]);
  });

  it('falls back to the standard picker when the native picker rejects', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const nativePicker = vi.fn(async () => {
      throw new Error('Native picker failed');
    });
    registerNativeImageFilesPicker(nativePicker);

    const files = await getImageFilesFromLocal();

    expect(nativePicker).toHaveBeenCalledTimes(1);
    expect(files).toEqual([]);
    expect(
      (
        HTMLInputElement.prototype as HTMLInputElement & {
          showPicker?: (this: HTMLInputElement) => void;
        }
      ).showPicker
    ).toHaveBeenCalledTimes(1);
  });
});
