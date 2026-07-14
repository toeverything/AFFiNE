import { beforeEach, expect, test } from 'vitest';

import { wait } from '../utils/common.js';
import { setupEditor } from '../utils/setup.js';

// Regression guard for the mobile IME fix (issue #14021): on desktop the page
// root must stay contenteditable. The fix only removes it on mobile (IS_MOBILE),
// where it otherwise swallows IME input meant for the block editors. The mobile
// side is environment-specific (needs a mobile WebView) and is covered by the
// per-block inline editor unit tests plus manual device testing.
beforeEach(async () => {
  const cleanup = await setupEditor('page');
  return cleanup;
});

test('desktop: page root stays contenteditable', async () => {
  await wait();
  const pageRoot = editor.host?.querySelector('affine-page-root');
  expect(pageRoot).toBeTruthy();
  expect((pageRoot as HTMLElement).getAttribute('contenteditable')).toBe(
    'true'
  );
});
