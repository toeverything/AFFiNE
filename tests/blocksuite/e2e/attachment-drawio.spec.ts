import { expect, type Page } from '@playwright/test';

import { pressEnter, type } from './utils/actions/keyboard.js';
import {
  enterPlaygroundRoom,
  focusRichText,
  initEmptyParagraphState,
  waitNextFrame,
} from './utils/actions/misc.js';
import { test } from './utils/playwright.js';

const DIAGRAM = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="app.diagrams.net"><diagram id="d1" name="Page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="2" value="Hello draw.io" vertex="1" parent="1"><mxGeometry x="40" y="40" width="120" height="60" as="geometry"/></mxCell></root></mxGraphModel></diagram></mxfile>`;

// Speaks the draw.io embed protocol: announces `init`, then renders the
// value of the first cell of the diagram it receives through `load`.
const MOCK_VIEWER = `<!doctype html><html><body><div id="shape"></div><div id="meta"></div>
<script>
window.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (message.action !== 'load') return;
  const cell = new DOMParser()
    .parseFromString(message.xml, 'text/xml')
    .querySelector('mxCell[value]');
  document.getElementById('shape').textContent = cell.getAttribute('value');
  const params = new URLSearchParams(location.search);
  document.getElementById('meta').textContent =
    message.title + ' chrome=' + params.get('chrome');
  parent.postMessage(JSON.stringify({ event: 'load' }), '*');
});
parent.postMessage(JSON.stringify({ event: 'init' }), '*');
</script></body></html>`;

const mockViewer = async (page: Page) => {
  const requests: string[] = [];
  await page.route('https://embed.diagrams.net/**', route => {
    requests.push(route.request().url());
    return route.fulfill({ contentType: 'text/html', body: MOCK_VIEWER });
  });
  return requests;
};

const uploadAttachment = async (page: Page, name: string, content: string) => {
  await page.evaluate(() => {
    // Force fallback to input[type=file] in tests
    window.showOpenFilePicker = undefined;
  });
  await focusRichText(page);
  const slashMenu = page.locator('.slash-menu');
  await waitNextFrame(page);
  await type(page, '/');
  await expect(slashMenu).toBeVisible();
  await type(page, 'file', 100);
  await expect(slashMenu).toBeVisible();
  const fileChooser = page.waitForEvent('filechooser');
  await pressEnter(page);
  await (
    await fileChooser
  ).setFiles({
    name,
    mimeType: 'application/octet-stream',
    buffer: Buffer.from(content),
  });
  const attachment = page.locator('affine-attachment');
  await attachment
    .locator('.affine-attachment-card.loading')
    .waitFor({ state: 'hidden' });
  return attachment;
};

const turnToEmbed = async (page: Page) => {
  await page.locator('affine-attachment .affine-attachment-card').click();
  const toolbar = page.locator('affine-toolbar-widget editor-toolbar');
  await toolbar.getByRole('button', { name: 'Switch view' }).click();
  await page.getByRole('button', { name: 'Embed view' }).click();
  await waitNextFrame(page);
};

test.describe('draw.io attachments', () => {
  test('renders a diagram with the draw.io viewer', async ({ page }) => {
    const requests = await mockViewer(page);
    await enterPlaygroundRoom(page);
    await initEmptyParagraphState(page);
    const attachment = await uploadAttachment(page, 'flow.drawio', DIAGRAM);

    await turnToEmbed(page);

    const viewer = attachment.locator('affine-attachment-drawio-viewer');
    await expect(viewer).toBeVisible();
    const frame = page.frameLocator('affine-attachment-drawio-viewer iframe');
    await expect(frame.locator('#shape')).toHaveText('Hello draw.io');
    await expect(frame.locator('#meta')).toHaveText('flow.drawio chrome=0');
    expect(requests).toHaveLength(1);
    expect(new URL(requests[0]).searchParams.get('proto')).toBe('json');

    // The diagram only takes pointer events while the block is selected.
    const mask = viewer.locator('.affine-drawio-viewer-mask');
    await expect(mask).toBeHidden();
    // click on empty space below the note to clear the selection
    await page.mouse.click(900, 850);
    await expect(mask).toBeVisible();
  });

  test('does not send other files to the viewer', async ({ page }) => {
    const requests = await mockViewer(page);
    await enterPlaygroundRoom(page);
    await initEmptyParagraphState(page);
    const attachment = await uploadAttachment(page, 'notes.drawio', 'hello');

    await turnToEmbed(page);

    await expect(attachment.getByTestId('drawio-viewer-error')).toHaveText(
      'This file is not a draw.io diagram.'
    );
    await expect(attachment.locator('iframe')).toHaveCount(0);
    expect(requests).toHaveLength(0);
  });
});
