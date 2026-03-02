import { test } from '@affine-test/kit/playwright';
import { locateToolbar } from '@affine-test/kit/utils/editor';
import {
  pressEnter,
  pressShiftTab,
  pressTab,
  selectAllByKeyboard,
  undoByKeyboard,
} from '@affine-test/kit/utils/keyboard';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  clickNewPageButton,
  type,
  waitForEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import type { ParagraphBlockComponent } from '@blocksuite/affine-block-paragraph';
import { expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await openHomePage(page);
  await clickNewPageButton(page, 'Paragraph Test');
  await waitForEditorLoad(page);
});

test('heading icon should be updated after change heading level', async ({
  page,
}) => {
  await page.keyboard.press('Enter');
  await page.keyboard.type('Hello');
  // Hello|
  // empty paragraph

  const paragraph = page.locator('affine-note affine-paragraph').nth(0);

  await selectAllByKeyboard(page);
  const toolbar = locateToolbar(page);
  await toolbar.getByLabel('Conversions').click();
  await toolbar.getByLabel('Heading 1').click();

  await paragraph.hover();
  await expect(page.getByTestId('heading-icon-1')).toBeVisible();

  await selectAllByKeyboard(page);
  await toolbar.getByLabel('Conversions').click();
  await toolbar.getByLabel('Heading 2').click();

  await paragraph.hover();
  await expect(page.getByTestId('heading-icon-1')).toBeHidden();
  await expect(page.getByTestId('heading-icon-2')).toBeVisible();
});

test('basic heading collapsed', async ({ page }) => {
  await pressEnter(page);

  /**
   * # aaa
   * bbb
   * ## ccc
   * ddd
   * ### eee
   * fff
   * ## ggg
   * hhh
   * # iii
   * jjj
   */
  await type(
    page,
    '# aaa\nbbb\n## ccc\nddd\n### eee\nfff\n## ggg\nhhh\n# iii\njjj'
  );
  const a = page.locator('affine-note affine-paragraph').nth(0);
  const b = page.locator('affine-note affine-paragraph').nth(1);
  const c = page.locator('affine-note affine-paragraph').nth(2);
  const d = page.locator('affine-note affine-paragraph').nth(3);
  const e = page.locator('affine-note affine-paragraph').nth(4);
  const f = page.locator('affine-note affine-paragraph').nth(5);
  const g = page.locator('affine-note affine-paragraph').nth(6);
  const h = page.locator('affine-note affine-paragraph').nth(7);
  const i = page.locator('affine-note affine-paragraph').nth(8);
  const j = page.locator('affine-note affine-paragraph').nth(9);

  const assertInitState = async () => {
    expect(await a.isVisible()).toBeTruthy();
    expect(await b.isVisible()).toBeTruthy();
    expect(await c.isVisible()).toBeTruthy();
    expect(await d.isVisible()).toBeTruthy();
    expect(await e.isVisible()).toBeTruthy();
    expect(await f.isVisible()).toBeTruthy();
    expect(await g.isVisible()).toBeTruthy();
    expect(await h.isVisible()).toBeTruthy();
    expect(await i.isVisible()).toBeTruthy();
    expect(await j.isVisible()).toBeTruthy();
  };
  await assertInitState();

  // fold h1 aaa
  await a.hover();
  await page.waitForTimeout(100);
  await a.locator('blocksuite-toggle-button .toggle-icon').click();
  expect(await a.isVisible()).toBeTruthy();
  expect(await b.isVisible()).toBeFalsy();
  expect(await c.isVisible()).toBeFalsy();
  expect(await d.isVisible()).toBeFalsy();
  expect(await e.isVisible()).toBeFalsy();
  expect(await f.isVisible()).toBeFalsy();
  expect(await g.isVisible()).toBeFalsy();
  expect(await h.isVisible()).toBeFalsy();
  expect(await i.isVisible()).toBeTruthy();
  expect(await j.isVisible()).toBeTruthy();
  await undoByKeyboard(page);
  await assertInitState();

  // fold h2 ccc
  await c.hover();
  await page.waitForTimeout(100);
  await c.locator('blocksuite-toggle-button .toggle-icon').click();
  expect(await a.isVisible()).toBeTruthy();
  expect(await b.isVisible()).toBeTruthy();
  expect(await c.isVisible()).toBeTruthy();
  expect(await d.isVisible()).toBeFalsy();
  expect(await e.isVisible()).toBeFalsy();
  expect(await f.isVisible()).toBeFalsy();
  expect(await g.isVisible()).toBeTruthy();
  expect(await h.isVisible()).toBeTruthy();
  expect(await i.isVisible()).toBeTruthy();
  expect(await j.isVisible()).toBeTruthy();
  await undoByKeyboard(page);
  await assertInitState();

  // fold h3 eee
  await e.hover();
  await page.waitForTimeout(100);
  await e.locator('blocksuite-toggle-button .toggle-icon').click();
  expect(await a.isVisible()).toBeTruthy();
  expect(await b.isVisible()).toBeTruthy();
  expect(await c.isVisible()).toBeTruthy();
  expect(await d.isVisible()).toBeTruthy();
  expect(await e.isVisible()).toBeTruthy();
  expect(await f.isVisible()).toBeFalsy();
  expect(await g.isVisible()).toBeTruthy();
  expect(await h.isVisible()).toBeTruthy();
  expect(await i.isVisible()).toBeTruthy();
  expect(await j.isVisible()).toBeTruthy();
  await undoByKeyboard(page);
  await assertInitState();

  // fold h2 ggg
  await g.hover();
  await page.waitForTimeout(100);
  await g.locator('blocksuite-toggle-button .toggle-icon').click();
  expect(await a.isVisible()).toBeTruthy();
  expect(await b.isVisible()).toBeTruthy();
  expect(await c.isVisible()).toBeTruthy();
  expect(await d.isVisible()).toBeTruthy();
  expect(await e.isVisible()).toBeTruthy();
  expect(await f.isVisible()).toBeTruthy();
  expect(await g.isVisible()).toBeTruthy();
  expect(await j.isVisible()).toBeTruthy();
});

test('add new heading when press enter at the end of collapsed heading', async ({
  page,
}) => {
  await pressEnter(page);
  await type(page, '# aaa');
  await page.keyboard.press('ArrowDown');
  await type(page, 'bbb');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowRight');

  const paragraph = page.locator('affine-note affine-paragraph');

  expect(
    await paragraph
      .nth(1)
      .evaluate(
        (block: ParagraphBlockComponent) =>
          block.model.props.text.toString() === 'bbb'
      )
  ).toBeTruthy();
  await pressEnter(page);
  expect(
    await paragraph
      .nth(1)
      .evaluate(
        (block: ParagraphBlockComponent) =>
          block.model.props.type === 'text' &&
          block.model.props.text.toString() === ''
      )
  ).toBeTruthy();
  expect(
    await paragraph
      .nth(2)
      .evaluate(
        (block: ParagraphBlockComponent) =>
          block.model.props.text.toString() === 'bbb'
      )
  ).toBeTruthy();

  await undoByKeyboard(page);
  expect(
    await paragraph
      .nth(1)
      .evaluate(
        (block: ParagraphBlockComponent) =>
          block.model.props.text.toString() === 'bbb'
      )
  ).toBeTruthy();
  expect(await paragraph.nth(1).isVisible()).toBeTruthy();
  await paragraph
    .nth(0)
    .locator('blocksuite-toggle-button .toggle-icon')
    .click();
  expect(await paragraph.nth(1).isVisible()).toBeFalsy();

  await paragraph.nth(0).click();
  expect(await paragraph.count()).toBe(2);
  await pressEnter(page);
  expect(await paragraph.count()).toBe(3);
  expect(
    await paragraph
      .nth(2)
      .evaluate(
        (block: ParagraphBlockComponent) =>
          block.model.props.type === 'h1' &&
          block.model.props.text.toString() === ''
      )
  ).toBeTruthy();
});

test('unfold collapsed heading when some block indented to be its child', async ({
  page,
}) => {
  await pressEnter(page);
  await type(page, '# aaa\nbbb\n# ccc');
  const paragraph = page.locator('affine-note affine-paragraph');
  await paragraph
    .nth(0)
    .locator('blocksuite-toggle-button .toggle-icon')
    .click();
  expect(await paragraph.nth(1).isVisible()).toBeFalsy();
  await paragraph.nth(2).click();
  await pressTab(page);
  expect(await paragraph.nth(1).isVisible()).toBeTruthy();
});

test('unfold collapsed heading when its siblings changed to text type from heading type', async ({
  page,
}) => {
  await pressEnter(page);
  await type(page, '# aaa\nbbb\n# ccc');
  const paragraph = page.locator('affine-note affine-paragraph');
  await paragraph
    .nth(0)
    .locator('blocksuite-toggle-button .toggle-icon')
    .click();
  expect(await paragraph.nth(1).isVisible()).toBeFalsy();
  await paragraph.nth(2).click();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  expect(
    await paragraph
      .nth(2)
      .evaluate(
        (block: ParagraphBlockComponent) =>
          block.model.props.type === 'h1' &&
          block.model.props.text.toString() === 'ccc'
      )
  ).toBeTruthy();
  await page.keyboard.press('Backspace');
  expect(
    await paragraph
      .nth(2)
      .evaluate(
        (block: ParagraphBlockComponent) =>
          block.model.props.type === 'text' &&
          block.model.props.text.toString() === 'ccc'
      )
  ).toBeTruthy();
  expect(await paragraph.nth(1).isVisible()).toBeTruthy();
});

test('also move children when dedent collapsed heading', async ({ page }) => {
  await pressEnter(page);
  await type(page, 'aaa');
  await page.keyboard.press('ArrowDown');
  await pressTab(page);
  await type(page, '# bbb\nccc');

  const paragraph = page.locator('affine-note affine-paragraph');
  const subParagraph = paragraph.nth(0).locator('affine-paragraph');
  expect(await subParagraph.count()).toBe(2);
  expect(
    await subParagraph
      .nth(0)
      .evaluate(
        (block: ParagraphBlockComponent) =>
          block.model.props.type === 'h1' &&
          block.model.props.text.toString() === 'bbb'
      )
  ).toBeTruthy();
  expect(
    await subParagraph
      .nth(1)
      .evaluate(
        (block: ParagraphBlockComponent) =>
          block.model.props.type === 'text' &&
          block.model.props.text.toString() === 'ccc'
      )
  ).toBeTruthy();

  expect(await subParagraph.nth(1).isVisible()).toBeTruthy();
  await subParagraph
    .nth(0)
    .locator('blocksuite-toggle-button .toggle-icon')
    .click();
  expect(await subParagraph.nth(1).isVisible()).toBeFalsy();

  await subParagraph.nth(0).click();
  await pressShiftTab(page);
  expect(await subParagraph.count()).toBe(0);
  expect(
    await paragraph
      .nth(1)
      .evaluate(
        (block: ParagraphBlockComponent) =>
          block.model.props.type === 'h1' &&
          block.model.props.text.toString() === 'bbb'
      )
  ).toBeTruthy();
  expect(
    await paragraph
      .nth(2)
      .evaluate(
        (block: ParagraphBlockComponent) =>
          block.model.props.type === 'text' &&
          block.model.props.text.toString() === 'ccc'
      )
  ).toBeTruthy();

  expect(await paragraph.nth(2).isVisible()).toBeFalsy();
  await paragraph
    .nth(1)
    .locator('blocksuite-toggle-button .toggle-icon')
    .click({
      position: {
        x: 5,
        y: 5,
      },
    });
  expect(await paragraph.nth(2).isVisible()).toBeTruthy();
});

test('also move collapsed siblings when indent collapsed heading', async ({
  page,
}) => {
  await pressEnter(page);
  await type(page, 'aaa');
  await page.keyboard.press('ArrowDown');
  await type(page, '# bbb\nccc');
  await page.keyboard.press('ArrowUp');

  const paragraph = page.locator('affine-note affine-paragraph');
  expect(await paragraph.nth(0).locator('affine-paragraph').count()).toBe(0);
  await pressTab(page);
  expect(await paragraph.nth(0).locator('affine-paragraph').count()).toBe(1);
  expect(
    await paragraph
      .nth(0)
      .locator('affine-paragraph')
      .nth(0)
      .evaluate(
        (block: ParagraphBlockComponent) =>
          block.model.props.type === 'h1' &&
          block.model.props.text.toString() === 'bbb'
      )
  ).toBeTruthy();
  await undoByKeyboard(page);

  expect(await paragraph.nth(2).isVisible()).toBeTruthy();
  await paragraph
    .nth(1)
    .locator('blocksuite-toggle-button .toggle-icon')
    .click();
  expect(await paragraph.nth(2).isVisible()).toBeFalsy();
  await paragraph.nth(1).click();
  await pressTab(page);
  expect(await paragraph.nth(2).isVisible()).toBeFalsy();
  expect(await paragraph.nth(0).locator('affine-paragraph').count()).toBe(2);
  expect(
    await paragraph
      .nth(0)
      .locator('affine-paragraph')
      .nth(0)
      .evaluate(
        (block: ParagraphBlockComponent) =>
          block.model.props.type === 'h1' &&
          block.model.props.text.toString() === 'bbb'
      )
  ).toBeTruthy();
  expect(
    await paragraph
      .nth(0)
      .locator('affine-paragraph')
      .nth(1)
      .evaluate(
        (block: ParagraphBlockComponent) =>
          block.model.props.type === 'text' &&
          block.model.props.text.toString() === 'ccc'
      )
  ).toBeTruthy();
});

test('unfold collapsed heading when its other blocks indented to be its sibling', async ({
  page,
}) => {
  await pressEnter(page);
  await type(page, 'aaa');
  await page.keyboard.press('ArrowDown');
  await type(page, '# bbb\nddd');
  await page.keyboard.press('ArrowUp');
  await pressTab(page);
  await page.keyboard.press('ArrowRight');
  await pressEnter(page);
  await type(page, 'ccc');

  /**
   * aaa
   *   # bbb
   *   ccc
   * ddd
   */

  const paragraph = page.locator('affine-note affine-paragraph');
  expect(await paragraph.nth(2).isVisible()).toBeTruthy();
  expect(
    await paragraph
      .nth(2)
      .evaluate(
        (block: ParagraphBlockComponent) =>
          block.model.props.type === 'text' &&
          block.model.props.text.toString() === 'ccc'
      )
  ).toBeTruthy();
  await paragraph.locator('blocksuite-toggle-button .toggle-icon').click();
  expect(await paragraph.nth(2).isVisible()).toBeFalsy();

  await paragraph.nth(3).click(); // ddd
  expect(await paragraph.nth(2).isVisible()).toBeFalsy();
  expect(await paragraph.nth(0).locator('affine-paragraph').count()).toBe(2);
  await pressTab(page);
  expect(await paragraph.nth(0).locator('affine-paragraph').count()).toBe(3);
  expect(await paragraph.nth(2).isVisible()).toBeTruthy();
});
