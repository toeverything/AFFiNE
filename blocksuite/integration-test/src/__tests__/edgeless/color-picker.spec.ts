import '@toeverything/theme/style.css';
import '@blocksuite/affine/gfx/pointer';

import type { EdgelessRootBlockComponent } from '@blocksuite/affine/blocks/root';
import { DefaultTool } from '@blocksuite/affine/blocks/surface';
import { ColorScheme } from '@blocksuite/affine/model';
import { ThemeProvider } from '@blocksuite/affine/shared/services';
import { beforeEach, describe, expect, test } from 'vitest';

import { getDocRootBlock } from '../utils/edgeless.js';
import { setupEditor } from '../utils/setup.js';

describe('theme service', () => {
  let edgeless!: EdgelessRootBlockComponent;

  beforeEach(async () => {
    const cleanup = await setupEditor('edgeless');

    edgeless = getDocRootBlock(doc, editor, 'edgeless');

    edgeless.gfx.tool.setTool(DefaultTool);

    const themeService = edgeless.gfx.std.get(ThemeProvider);
    themeService.theme$.value = ColorScheme.Light;

    return cleanup;
  });

  test('switches theme', () => {
    const themeService = edgeless.gfx.std.get(ThemeProvider);
    expect(themeService.theme).toBe(ColorScheme.Light);

    themeService.theme$.value = ColorScheme.Dark;
    expect(themeService.theme).toBe(ColorScheme.Dark);

    themeService.theme$.value = ColorScheme.Light;
    expect(themeService.theme).toBe(ColorScheme.Light);
  });

  test('generates a color property', () => {
    const themeService = edgeless.gfx.std.get(ThemeProvider);
    expect(themeService.theme).toBe(ColorScheme.Light);

    expect(themeService.generateColorProperty('--affine-hover-color')).toBe(
      'var(--affine-hover-color)'
    );

    expect(themeService.generateColorProperty('--affine-transparent')).toBe(
      'transparent'
    );

    expect(themeService.generateColorProperty('transparent')).toBe(
      'transparent'
    );

    expect(
      themeService.generateColorProperty({ dark: 'white', light: 'black' })
    ).toBe('black');

    themeService.theme$.value = ColorScheme.Dark;
    expect(themeService.theme).toBe(ColorScheme.Dark);

    expect(
      themeService.generateColorProperty({ dark: 'white', light: 'black' })
    ).toBe('white');

    expect(themeService.generateColorProperty({ normal: 'grey' })).toBe('grey');

    expect(themeService.generateColorProperty('', 'blue')).toBe('blue');
  });

  test('gets a color value', () => {
    const themeService = edgeless.gfx.std.get(ThemeProvider);
    expect(themeService.theme).toBe(ColorScheme.Light);

    expect(themeService.getColorValue('--affine-transparent')).toBe(
      '--affine-transparent'
    );
    expect(
      themeService.getColorValue('--affine-transparent', 'transparent', true)
    ).toBe('transparent');
    expect(
      themeService.getColorValue('--affine-hover-color', 'transparent', true)
    ).toBe('rgba(0, 0, 0, 0.04)');
    expect(
      themeService.getColorValue('--affine-tooltip', undefined, true)
    ).toBe('rgba(0, 0, 0, 1)');

    expect(
      themeService.getColorValue(
        { dark: 'white', light: 'black' },
        undefined,
        true
      )
    ).toBe('black');
    expect(
      themeService.getColorValue({ dark: 'white', light: '' }, undefined, true)
    ).toBe('transparent');
    expect(
      themeService.getColorValue({ normal: 'grey' }, undefined, true)
    ).toBe('grey');

    themeService.theme$.value = ColorScheme.Dark;
    expect(themeService.theme).toBe(ColorScheme.Dark);

    expect(
      themeService.getColorValue('--affine-hover-color', 'transparent', true)
    ).toEqual('rgba(255, 255, 255, 0.1)');
    expect(
      themeService.getColorValue('--affine-tooltip', undefined, true)
    ).toEqual('rgba(234, 234, 234, 1)'); // #eaeaea
  });
});
