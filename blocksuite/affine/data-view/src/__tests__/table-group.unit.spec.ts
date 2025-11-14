import { describe, expect, test } from 'vitest';

import { mobileEffects } from '../view-presets/table/mobile/effect.js';
import type { MobileTableGroup } from '../view-presets/table/mobile/group.js';
import { pcEffects } from '../view-presets/table/pc/effect.js';
import type { TableGroup } from '../view-presets/table/pc/group.js';

/** @vitest-environment happy-dom */

describe('TableGroup', () => {
  test('toggle collapse on pc', () => {
    pcEffects();
    const group = document.createElement(
      'affine-data-view-table-group'
    ) as TableGroup;

    expect(group.collapsed$.value).toBe(false);
    (group as any)._toggleCollapse();
    expect(group.collapsed$.value).toBe(true);
    (group as any)._toggleCollapse();
    expect(group.collapsed$.value).toBe(false);
  });

  test('toggle collapse on mobile', () => {
    mobileEffects();
    const group = document.createElement(
      'mobile-table-group'
    ) as MobileTableGroup;

    expect(group.collapsed$.value).toBe(false);
    (group as any)._toggleCollapse();
    expect(group.collapsed$.value).toBe(true);
    (group as any)._toggleCollapse();
    expect(group.collapsed$.value).toBe(false);
  });
});
