/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, test } from 'vitest';

import { setupGlobal } from '../global';

// helper to reset environment before each test
function reset() {
  delete (globalThis as any).environment;
  // @ts-expect-error allow delete
  delete (globalThis as any).$AFFINE_SETUP;
  document.head.innerHTML = '';
}

describe('setupGlobal allowDemoWorkspace', () => {
  beforeEach(() => {
    reset();
  });

  test('should default to true', () => {
    setupGlobal();
    expect(environment.allowDemoWorkspace).toBe(true);
  });

  test('should read override from meta tag', () => {
    const meta = document.createElement('meta');
    meta.name = 'env:allowDemoWorkspace';
    meta.content = 'false';
    document.head.append(meta);

    setupGlobal();

    expect(environment.allowDemoWorkspace).toBe(false);
  });
});
