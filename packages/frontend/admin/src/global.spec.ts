import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'vitest';

const css = readFileSync(new URL('./global.css', import.meta.url), 'utf8');

describe('admin global token mapping', () => {
  test('maps semantic colors to affine tokens', () => {
    expect(css).toContain(
      '--background: var(--affine-v2-layer-background-primary);'
    );
    expect(css).toContain('--foreground: var(--affine-v2-text-primary);');
    expect(css).toContain('--primary: var(--affine-v2-button-primary);');
    expect(css).toContain('--ring: var(--affine-v2-input-border-active);');
    expect(css).toContain('--radius: var(--affine-popover-radius);');
  });

  test('does not keep hardcoded shadcn light/dark values', () => {
    expect(css).not.toContain('--background: 0 0% 100%;');
    expect(css).not.toContain('--foreground: 240 10% 3.9%;');
    expect(css).not.toContain('--background: 240 10% 3.9%;');
  });

  test('supports data-theme based dark variant', () => {
    expect(css).toContain("[data-theme='dark']");
  });
});
