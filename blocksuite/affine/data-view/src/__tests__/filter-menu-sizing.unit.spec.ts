/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest';

import { sizeFilterMenuToContent } from '../widget-presets/quick-setting-bar/filter/menu-sizing.js';

// 999.10: on mobile the filter's condition menu is a full-screen sheet
// (`mobile-menu`, height: 100%). The desktop "fit the calendar" sizing
// (max-height: fit-content) capped it at header + padding: the date picker
// was squeezed into a 48px scroll strip (measured on device: body 48px tall,
// content 394px).
describe('sizeFilterMenuToContent', () => {
  it('sizes the desktop popup to its content', () => {
    const el = document.createElement('div');
    sizeFilterMenuToContent(el, false);
    expect(el.style.minHeight).toBe('fit-content');
    expect(el.style.maxHeight).toBe('fit-content');
    expect(el.style.minWidth).toBe('200px');
  });

  it('leaves the mobile full-screen sheet alone', () => {
    const el = document.createElement('div');
    sizeFilterMenuToContent(el, true);
    expect(el.style.minHeight).toBe('');
    expect(el.style.maxHeight).toBe('');
    expect(el.style.minWidth).toBe('');
  });
});
