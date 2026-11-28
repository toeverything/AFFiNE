import { afterEach, describe, expect, it, vi } from 'vitest';

import { openFilesWith } from '../../utils';

type PickerInput = HTMLInputElement & {
  showPicker?: (this: HTMLInputElement) => void;
};

describe('openFilesWith fallback input', () => {
  const prototype = HTMLInputElement.prototype as PickerInput;
  const originalShowPicker = prototype.showPicker;

  afterEach(() => {
    if (originalShowPicker) {
      prototype.showPicker = originalShowPicker;
    } else {
      delete (prototype as { showPicker?: unknown }).showPicker;
    }
  });

  it('accepts both MIME types and extensions', async () => {
    let accept = '';
    prototype.showPicker = vi.fn(function (this: HTMLInputElement) {
      accept = this.accept;
      this.dispatchEvent(new Event('cancel'));
    });

    expect(await openFilesWith('MindMap')).toBeNull();
    expect(accept.split(',')).toEqual([
      'text/xml',
      'application/vnd.xmind.workbook',
      '.mm',
      '.opml',
      '.xml',
      '.xmind',
    ]);
  });
});
