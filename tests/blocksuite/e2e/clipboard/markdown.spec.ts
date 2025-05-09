import {
  enterPlaygroundRoom,
  focusRichText,
  initEmptyParagraphState,
  pasteContent,
  resetHistory,
  undoByClick,
  waitEmbedLoaded,
  waitNextFrame,
} from '../utils/actions/index.js';
import {
  assertBlockTypes,
  assertRichImage,
  assertRichTexts,
  assertTextFormats,
} from '../utils/asserts.js';
import { scoped, test } from '../utils/playwright.js';

test(scoped`markdown format parse`, async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);
  await resetHistory(page);

  let clipData = {
    'text/plain': `# h1

## h2

### h3

#### h4

##### h5

###### h6

- [ ] todo

- [ ] todo

- [x] todo

* bulleted

- bulleted

1. numbered

> quote
`,
  };
  await waitNextFrame(page);
  await pasteContent(page, clipData);
  await page.waitForTimeout(200);
  await assertBlockTypes(page, [
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'todo',
    'todo',
    'todo',
    'bulleted',
    'bulleted',
    'numbered',
    'quote',
  ]);
  await assertRichTexts(page, [
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'todo',
    'todo',
    'todo',
    'bulleted',
    'bulleted',
    'numbered',
    'quote',
  ]);
  await undoByClick(page);
  await assertRichTexts(page, ['']);
  await focusRichText(page);

  clipData = {
    'text/plain': `# ***bolditalic***
# **bold**

*italic*

~~strikethrough~~

[link](linktest)

\`code\`
`,
  };
  await waitNextFrame(page);
  await pasteContent(page, clipData);
  await page.waitForTimeout(200);
  await assertTextFormats(page, [
    { bold: true, italic: true },
    { bold: true },
    { italic: true },
    { strike: true },
    { link: 'linktest' },
    { code: true },
  ]);
  await undoByClick(page);
  await assertRichTexts(page, ['']);
});

test(scoped`import markdown`, async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);
  await resetHistory(page);
  const clipData = `# text
# h1
`;
  await pasteContent(page, { 'text/plain': clipData });
  await page.waitForTimeout(100);
  await assertRichTexts(page, ['text', 'h1']);
  await undoByClick(page);
  await assertRichTexts(page, ['']);
});

test(
  scoped`clipboard paste HTML containing markdown syntax code and image `,
  async ({ page }) => {
    test.info().annotations.push({
      type: 'issue',
      description: 'https://github.com/toeverything/blocksuite/issues/2855',
    });
    await enterPlaygroundRoom(page);
    await initEmptyParagraphState(page);
    await focusRichText(page);

    // set up clipboard data using html
    const clipData = {
      'text/html': `<p>符合 Markdown 格式的 URL 放到笔记中，此时需要的格式如下：</p>
    <pre><code>md [任务管理这件事 - 少数派](https://sspai.com/post/61092)</code></pre>
    <p>（将一段文字包裹在<code >[[]]</code>中）此时需要的格式如下：</p>
    <figure ><img src="https://placehold.co/600x400"></figure>
    <p>上图中，当我们处在 Obsidian 的「预览模式」时，点击这个「双向链接」</p>
    `,
    };
    await page.evaluate(
      ({ clipData }) => {
        const dT = new DataTransfer();
        const e = new ClipboardEvent('paste', { clipboardData: dT });
        Object.defineProperty(e, 'target', {
          writable: false,
          value: document,
        });
        e.clipboardData?.setData('text/html', clipData['text/html']);
        document.dispatchEvent(e);
      },
      { clipData }
    );
    await waitEmbedLoaded(page);
    // await page.waitForTimeout(500);
    await assertRichImage(page, 1);
  }
);
