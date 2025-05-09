import { expect } from '@playwright/test';

import { dragBetweenCoords } from '../utils/actions/drag.js';
import { toggleMultipleEditors } from '../utils/actions/edgeless.js';
import {
  enterPlaygroundRoom,
  initEmptyParagraphState,
  initThreeParagraphs,
} from '../utils/actions/misc.js';
import { getRichTextBoundingBox } from '../utils/actions/selection.js';
import { test } from '../utils/playwright.js';

test('should only show one format bar when multiple editors are toggled', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await initThreeParagraphs(page);
  await toggleMultipleEditors(page);

  // Select some text
  const box123 = await getRichTextBoundingBox(page, '2');
  const above123 = { x: box123.left + 10, y: box123.top + 2 };

  const box789 = await getRichTextBoundingBox(page, '4');
  const bottomRight789 = { x: box789.right - 10, y: box789.bottom - 2 };

  await dragBetweenCoords(page, above123, bottomRight789, { steps: 10 });

  // should only show one format bar
  const formatBar = page.locator(
    'affine-toolbar-widget editor-toolbar[data-open]'
  );
  await expect(formatBar).toHaveCount(1);
});
