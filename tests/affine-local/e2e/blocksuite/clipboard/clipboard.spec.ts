import { test } from '@affine-test/kit/playwright';
import { importFile } from '@affine-test/kit/utils/attachment';
import { pasteContent } from '@affine-test/kit/utils/clipboard';
import {
  clickEdgelessModeButton,
  clickPageModeButton,
  clickView,
  getCodeBlockIds,
  getParagraphIds,
  locateEditorContainer,
  toViewCoord,
} from '@affine-test/kit/utils/editor';
import {
  copyByKeyboard,
  cutByKeyboard,
  pasteByKeyboard,
  pressEnter,
} from '@affine-test/kit/utils/keyboard';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  addCodeBlock,
  clickNewPageButton,
  type,
  waitForEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import { setSelection } from '@affine-test/kit/utils/selection';
import type { CodeBlockComponent } from '@blocksuite/affine-block-code';
import type { ParagraphBlockComponent } from '@blocksuite/affine-block-paragraph';
import type { PageRootBlockComponent } from '@blocksuite/affine-block-root';
import type { BlockComponent } from '@blocksuite/std';
import { expect, type Page } from '@playwright/test';

const paragraphLocator = 'affine-note affine-paragraph';
const codeBlockLocator = 'affine-note affine-code';

// Helper function to create paragraph blocks with text
async function createParagraphBlocks(page: Page, texts: string[]) {
  for (const text of texts) {
    await pressEnter(page);
    await type(page, text);
  }
}

// Helper function to verify block text content
async function verifyBlockContent<T extends BlockComponent>(
  page: Page,
  selector: string,
  index: number,
  expectedText: string
) {
  expect(
    await page
      .locator(selector)
      .nth(index)
      .evaluate((block: T, expected: string) => {
        const model = block.model;
        // Check if model has text property
        if (!('text' in model)) return false;
        const text = model.text;
        // Check if text exists and has toString method
        return text && text.toString() === expected;
      }, expectedText)
  ).toBeTruthy();
}

// Helper functions using the generic verifyBlockContent
async function verifyParagraphContent(
  page: Page,
  index: number,
  expectedText: string
) {
  await verifyBlockContent<ParagraphBlockComponent>(
    page,
    paragraphLocator,
    index,
    expectedText
  );
}

async function verifyCodeBlockContent(
  page: Page,
  index: number,
  expectedText: string
) {
  await verifyBlockContent<CodeBlockComponent>(
    page,
    codeBlockLocator,
    index,
    expectedText
  );
}

test.beforeEach(async ({ page }) => {
  await openHomePage(page);
  await clickNewPageButton(page, 'Clipboard Test');
  await waitForEditorLoad(page);
});

test.describe('paste in multiple blocks text selection', () => {
  test('paste plain text', async ({ page }) => {
    const texts = ['hello world', 'hello world', 'hello world'];
    await createParagraphBlocks(page, texts);

    const { blockIds: paragraphIds } = await getParagraphIds(page);

    /**
     * select text cross the 3 blocks:
     * hello |world
     * hello world
     * hello| world
     */
    await setSelection(page, paragraphIds[0], 6, paragraphIds[2], 5);

    await pasteContent(page, { 'text/plain': 'test' });

    /**
     * after paste:
     * hello test world
     */
    await verifyParagraphContent(page, 0, 'hello test world');
  });

  test('paste snapshot', async ({ page }) => {
    // Create initial test blocks
    await createParagraphBlocks(page, ['test', 'test']);

    // Create target blocks
    await createParagraphBlocks(page, [
      'hello world',
      'hello world',
      'hello world',
    ]);

    /**
     * before paste:
     * test
     * test
     * hello world
     * hello world
     * hello world
     */
    const { blockIds: paragraphIds } = await getParagraphIds(page);

    /**
     * select the first 2 blocks:
     * |test
     * test|
     * hello world
     * hello world
     * hello world
     */
    await setSelection(page, paragraphIds[0], 0, paragraphIds[1], 4);
    // copy the first 2 blocks
    await copyByKeyboard(page);

    /**
     * select the last 3 blocks:
     * test
     * test
     * hello |world
     * hello world
     * hello| world
     */
    await setSelection(page, paragraphIds[2], 6, paragraphIds[4], 5);

    // paste the first 2 blocks
    await pasteByKeyboard(page);
    await page.waitForTimeout(100);

    /**
     * after paste:
     * test
     * test
     * hello test
     * test world
     */
    await verifyParagraphContent(page, 2, 'hello test');
    await verifyParagraphContent(page, 3, 'test world');
  });
});

test.describe('surface-ref block', () => {
  async function setupSurfaceRefBlock(page: Page) {
    await clickEdgelessModeButton(page);
    const container = locateEditorContainer(page);
    await container.click();

    // add a shape
    await page.keyboard.press('s');
    await container.click({ position: { x: 100, y: 300 } });
    await page.waitForTimeout(50);

    // add a frame
    await page.keyboard.press('f');
    await page.waitForTimeout(50);

    // click on the frame title to trigger the change frame button toolbar
    const frameTitle = page.locator('affine-frame-title');
    await frameTitle.click();
    await page.waitForTimeout(50);

    const toolbar = page.locator('affine-toolbar-widget editor-toolbar');
    const insertIntoPageButton = toolbar.getByLabel('Insert into Page');
    await insertIntoPageButton.click();

    await clickPageModeButton(page);
    await waitForEditorLoad(page);
    await container.click();

    return { container };
  }

  test('paste surface-ref block to another doc as embed-linked-doc block', async ({
    page,
  }) => {
    await setupSurfaceRefBlock(page);

    // copy surface-ref block
    const surfaceRefBlock = page.locator('affine-surface-ref');
    await surfaceRefBlock.click();
    await page.waitForSelector('affine-surface-ref .focused');
    await copyByKeyboard(page);

    // paste to another doc
    await clickNewPageButton(page, 'page2');
    await pressEnter(page);

    // paste the surface-ref block
    await pasteByKeyboard(page);
    await page.waitForTimeout(50);

    const embedLinkedDocBlock = page.locator('affine-embed-linked-doc-block');
    await expect(embedLinkedDocBlock).toBeVisible();
    const embedLinkedDocBlockTitle = embedLinkedDocBlock.locator(
      '.affine-embed-linked-doc-content-title-text'
    );
    await expect(embedLinkedDocBlockTitle).toHaveText('Clipboard Test');
  });

  test('cut and paste surface-ref block to same doc should remain surface-ref block', async ({
    page,
  }) => {
    const { container } = await setupSurfaceRefBlock(page);

    // cut surface-ref block
    const surfaceRefBlock = page.locator('affine-surface-ref');
    await surfaceRefBlock.click();
    await page.waitForSelector('affine-surface-ref .focused');
    await cutByKeyboard(page);

    // focus on the editor
    await container.click();

    // paste the surface-ref block
    await pasteByKeyboard(page);
    await page.waitForTimeout(50);
    await expect(surfaceRefBlock).toHaveCount(1);
    await expect(surfaceRefBlock).toBeVisible();
  });
});

test.describe('paste to code block', () => {
  test('should replace the selected text when pasting plain text', async ({
    page,
  }) => {
    // press enter to focus on the first block of the editor
    await pressEnter(page);
    await addCodeBlock(page);
    await type(page, 'hello world hello');
    const { blockIds: codeBlockIds } = await getCodeBlockIds(page);
    await setSelection(page, codeBlockIds[0], 6, codeBlockIds[0], 11);
    await pasteContent(page, { 'text/plain': 'test' });
    await verifyCodeBlockContent(page, 0, 'hello test hello');
  });

  test('should replace the selected text when pasting single snapshot', async ({
    page,
  }) => {
    // Create initial test blocks
    // add a paragraph block
    await createParagraphBlocks(page, ['test']);
    // add a code block
    await pressEnter(page);
    await addCodeBlock(page);
    await type(page, 'hello world hello');

    // select the paragraph content
    const { blockIds: paragraphIds } = await getParagraphIds(page);
    await setSelection(page, paragraphIds[0], 0, paragraphIds[0], 4);
    // copy the paragraph content
    await copyByKeyboard(page);

    // select 'world' in the code block
    const { blockIds: codeBlockIds } = await getCodeBlockIds(page);
    await setSelection(page, codeBlockIds[0], 6, codeBlockIds[0], 11);

    // paste to the code block
    await pasteByKeyboard(page);
    await page.waitForTimeout(100);

    await verifyCodeBlockContent(page, 0, 'hello test hello');
  });

  test('should replace the selected text when pasting multiple snapshots', async ({
    page,
  }) => {
    // Create initial test blocks
    // add three paragraph blocks
    await createParagraphBlocks(page, ['test', 'test', 'test']);

    // add a code block
    await pressEnter(page);
    await addCodeBlock(page);
    await type(page, 'hello world hello');

    // select all paragraph content
    const { blockIds: paragraphIds } = await getParagraphIds(page);
    await setSelection(page, paragraphIds[0], 0, paragraphIds[2], 4);
    // copy the paragraph content
    await copyByKeyboard(page);

    // select 'world' in the code block
    const { blockIds: codeBlockIds } = await getCodeBlockIds(page);
    await setSelection(page, codeBlockIds[0], 6, codeBlockIds[0], 11);

    // paste to the code block
    await pasteByKeyboard(page);
    await page.waitForTimeout(100);

    await verifyCodeBlockContent(page, 0, 'hello test\ntest\ntest hello');
  });

  test('should preserve indentation when pasting code with spaces into code block', async ({
    page,
  }) => {
    await pressEnter(page);
    await addCodeBlock(page);

    // Sample code with proper indentation for text/plain
    const plainTextCode = [
      'const fibonacci = (n: number): number => {',
      '  if (n <= 1) return n;',
      '  return fibonacci(n - 1) + fibonacci(n - 2);',
      '}',
      'function generateSequence(length: number) {',
      '  const sequence = [];',
      '  for (let i = 0; i < length; i++) {',
      '    sequence.push(fibonacci(i));',
      '  }',
      '  return sequence;',
      '}',
    ].join('\n');

    const htmlCode =
      '<div><span>const</span><span> </span><span>fibonacci</span><span> </span><span>=</span><span> (n</span><span>:</span><span> </span><span>number</span><span>)</span><span>:</span><span> </span><span>number</span><span> </span><span>=></span><span> {</span></div><div><span>  </span><span>if</span><span> (n </span><span><=</span><span> </span><span>1</span><span>) </span><span>return</span><span> n;</span></div><div><span>  </span><span>return</span><span> </span><span>fibonacci</span><span>(n </span><span>-</span><span> </span><span>1</span><span>) </span><span>+</span><span> </span><span>fibonacci</span><span>(n </span><span>-</span><span> </span><span>2</span><span>);</span></div><div><span>}</span></div><div><span>function</span><span> </span><span>generateSequence</span><span>(length</span><span>:</span><span> </span><span>number</span><span>) {</span></div><div><span>  </span><span>const</span><span> </span><span>sequence</span><span> </span><span>=</span><span> [];</span></div><div><span>  </span><span>for</span><span> (</span><span>let</span><span> i </span><span>=</span><span> </span><span>0</span><span>; i </span><span><</span><span> length; i</span><span>++</span><span>) {</span></div><div><span>    sequence.</span><span>push</span><span>(</span><span>fibonacci</span><span>(i));</span></div><div><span>  }</span></div><div><span>  </span><span>return</span><span> sequence;</span></div><div><span>}</span></div></div>';

    await pasteContent(page, {
      'text/plain': plainTextCode,
      'text/html': htmlCode,
    });
    await page.waitForTimeout(100);

    // Verify the pasted code maintains indentation
    await verifyCodeBlockContent(page, 0, plainTextCode);
  });

  test('html tag should be treated as plain text when pasting', async ({
    page,
  }) => {
    await pressEnter(page);
    await addCodeBlock(page);

    const textWithHtmlTags =
      '<div><span>const</span><span> </span><span>fibonacci</span><span> </span><span>=</span><span> (n</span><span>:</span><span> </span><span>number</span><span>)</span><span>:</span><span> </span><span>number</span><span> </span><span>=></span><span> {</span></div><div><span>  </span><span>if</span><span> (n </span><span><=</span><span> </span><span>1</span><span>) </span><span>return</span><span> n;</span></div><div><span>  </span><span>return</span><span> </span><span>fibonacci</span><span>(n </span><span>-</span><span> </span><span>1</span><span>) </span><span>+</span><span> </span><span>fibonacci</span><span>(n </span><span>-</span><span> </span><span>2</span><span>);</span></div><div><span>}</span></div><div><span>function</span><span> </span><span>generateSequence</span><span>(length</span><span>:</span><span> </span><span>number</span><span>) {</span></div><div><span>  </span><span>const</span><span> </span><span>sequence</span><span> </span><span>=</span><span> [];</span></div><div><span>  </span><span>for</span><span> (</span><span>let</span><span> i </span><span>=</span><span> </span><span>0</span><span>; i </span><span><</span><span> length; i</span><span>++</span><span>) {</span></div><div><span>    sequence.</span><span>push</span><span>(</span><span>fibonacci</span><span>(i));</span></div><div><span>  }</span></div><div><span>  </span><span>return</span><span> sequence;</span></div><div><span>}</span></div></div>';

    await pasteContent(page, { 'text/plain': textWithHtmlTags });
    await page.waitForTimeout(100);

    // Verify the pasted code maintains indentation
    await verifyCodeBlockContent(page, 0, textWithHtmlTags);
  });

  test('should not wrap line in brackets when pasting code', async ({
    page,
  }) => {
    await pressEnter(page);
    await addCodeBlock(page);
    const plainTextCode = [
      '  model: anthropic("claude-sonnet-4-5-20250929"),',
      '  prompt: How many people will live in the world in 2040?',
      '  providerOptions: {',
      '    anthropic: {',
      '      thinking: { type: enabled, budgetTokens: 12000 },',
      '    } satisfies AnthropicProviderOptions,',
      '  },',
    ].join('\n');

    await pasteContent(page, { 'text/plain': plainTextCode });
    await page.waitForTimeout(100);

    // Verify the pasted code maintains indentation
    await verifyCodeBlockContent(page, 0, plainTextCode);
  });

  test('should paste markdown text as plain text', async ({ page }) => {
    await pressEnter(page);
    await addCodeBlock(page);

    const markdownText = [
      '# Heading 1',
      '',
      '## Heading 2 with **bold** and *italic*',
      '',
      '### Lists:',
      '- Item 1',
      '  - Nested item with `inline code`',
      '  - Another nested item',
      '- Item 2 with [link](https://example.com)',
      '',
      '```typescript',
      'const code = "block";',
      'console.log(code);',
      '```',
      '',
      '> This is a blockquote with **bold** text',
      '> Multiple lines in blockquote',
      '',
      '| Table | Header |',
      '|-------|--------|',
      '| Cell 1 | Cell 2 |',
      '$This is a inline latex$',
    ].join('\n');

    await pasteContent(page, { 'text/plain': markdownText });
    await page.waitForTimeout(100);

    // Verify the pasted code maintains indentation
    await verifyCodeBlockContent(page, 0, markdownText);
  });
});

test.describe('paste in readonly mode', () => {
  test('should not paste content when document is in readonly mode', async ({
    page,
  }) => {
    await createParagraphBlocks(page, ['This is a test paragraph']);
    const { blockIds } = await getParagraphIds(page);
    const initialParagraphCount = blockIds.length;

    await page.evaluate(() => {
      const pageRoot = document.querySelector(
        'affine-page-root'
      ) as PageRootBlockComponent;
      pageRoot.store.readonly = true;
    });

    await setSelection(page, blockIds[0], 0, blockIds[0], 4);
    await pasteContent(page, {
      'text/plain': ' - Added text that should not appear',
    });

    await verifyParagraphContent(page, 0, 'This is a test paragraph');

    await pressEnter(page);
    await pasteContent(page, { 'text/plain': 'This should not be pasted' });

    const { blockIds: afterParagraphIds } = await getParagraphIds(page);
    expect(afterParagraphIds.length).toBe(initialParagraphCount);

    await setSelection(page, blockIds[0], 0, blockIds[0], 4);
    await pasteByKeyboard(page);

    await verifyParagraphContent(page, 0, 'This is a test paragraph');
  });
});

test.describe('cross document clipboard regression', () => {
  test('copy and paste paragraph content between docs', async ({ page }) => {
    const container = locateEditorContainer(page);
    await container.click();

    const sourceText = "Cross-doc paste can't fail again";
    await type(page, sourceText);

    const { blockIds } = await getParagraphIds(page);
    await setSelection(page, blockIds[0], 0, blockIds[0], sourceText.length);

    await copyByKeyboard(page);

    await clickNewPageButton(page, 'Clipboard Destination');
    await waitForEditorLoad(page);

    const destination = locateEditorContainer(page);
    await destination.click();

    await pasteByKeyboard(page);
    await page.waitForTimeout(100);

    const pastedTexts = await page.locator(paragraphLocator).allTextContents();
    expect(pastedTexts.some(text => text.includes(sourceText))).toBe(true);
  });

  test('copied content remains available to external clipboard consumers', async ({
    page,
  }) => {
    const container = locateEditorContainer(page);
    await container.click();

    const textForExternal = 'External clipboard visibility check';
    await type(page, textForExternal);

    const { blockIds } = await getParagraphIds(page);
    await setSelection(
      page,
      blockIds[0],
      0,
      blockIds[0],
      textForExternal.length
    );

    await copyByKeyboard(page);

    const plainText = await page.evaluate(() => navigator.clipboard.readText());

    expect(plainText).toBe(textForExternal);
  });

  test('copy and paste within a single document still duplicates content', async ({
    page,
  }) => {
    const container = locateEditorContainer(page);
    await container.click();

    const intraDocText = 'Same doc paste regression guard';
    await type(page, intraDocText);

    const { blockIds } = await getParagraphIds(page);
    await setSelection(page, blockIds[0], 0, blockIds[0], intraDocText.length);

    await copyByKeyboard(page);

    await pressEnter(page);
    await pasteByKeyboard(page);
    await page.waitForTimeout(100);

    await verifyParagraphContent(page, 1, intraDocText);
  });
});

test('should copy single image from edgeless and paste to page', async ({
  page,
}) => {
  await clickEdgelessModeButton(page);

  const button = page.locator('edgeless-mindmap-tool-button');
  await button.click();

  const menu = page.locator('edgeless-mindmap-menu');
  const mediaItem = menu.locator('.media-item');
  await mediaItem.click();

  await importFile(page, 'large-image.png', async () => {
    await toViewCoord(page, [100, 250]);
    await clickView(page, [100, 250]);
  });

  const image = page.locator('affine-edgeless-image').first();
  await image.click();

  await copyByKeyboard(page);

  await clickPageModeButton(page);
  await waitForEditorLoad(page);

  const container = locateEditorContainer(page);
  await container.click();

  await pasteByKeyboard(page);

  await expect(page.locator('affine-page-image')).toBeVisible();
});
