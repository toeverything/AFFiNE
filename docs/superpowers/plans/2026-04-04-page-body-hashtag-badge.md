# Page-Body Hashtag Badge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render `#tag` text as a badge in page-mode paragraph/list rich text while preserving literal stored text.

**Architecture:** Add one page-mode-only inline manager. Add one hashtag-aware plain-text inline spec. Keep the shared default manager unchanged. Switch paragraph/list blocks to the page manager only in `page` mode. Verify with focused e2e tests.

**Tech Stack:** TypeScript, Lit, BlockSuite inline manager, Playwright e2e

---

### Task 1: Add failing page-body hashtag e2e tests

**Files:**

- Create: `tests/blocksuite/e2e/page-hashtag.spec.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { expect, test } from '@playwright/test';

import { switchReadonly } from './utils/actions/click.js';
import { pressBackspace, type } from './utils/actions/keyboard.js';
import { enterPlaygroundRoom, focusRichText, initEmptyParagraphState } from './utils/actions/misc.js';
import { assertRichTexts } from './utils/asserts.js';

test('renders hashtag text as badge and preserves plain text', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);

  await type(page, 'hello #todo world');

  await assertRichTexts(page, ['hello #todo world']);
  await expect(page.locator('.affine-page-hashtag-badge')).toHaveCount(1);
  await expect(page.locator('.affine-page-hashtag-badge')).toHaveText('#todo');
});

test('ends badge on the next space', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);

  await type(page, '#todo next');

  await expect(page.locator('.affine-page-hashtag-badge')).toHaveCount(1);
  await expect(page.locator('.affine-page-hashtag-badge')).toHaveText('#todo');
  await assertRichTexts(page, ['#todo next']);
});

test('updates badge text through backspace like plain text', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);

  await type(page, '#todo');
  await pressBackspace(page);

  await assertRichTexts(page, ['#tod']);
  await expect(page.locator('.affine-page-hashtag-badge')).toHaveText('#tod');
});

test('keeps hashtag badge rendering in readonly page mode', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);

  await type(page, '#todo');
  await switchReadonly(page);

  await assertRichTexts(page, ['#todo']);
  await expect(page.locator('.affine-page-hashtag-badge')).toHaveCount(1);
  await expect(page.locator('.affine-page-hashtag-badge')).toHaveText('#todo');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn --cwd tests/blocksuite playwright test e2e/page-hashtag.spec.ts`

Expected: FAIL because `.affine-page-hashtag-badge` does not exist yet.

### Task 2: Add page-mode hashtag rendering

**Files:**

- Modify: `blocksuite/affine/inlines/preset/src/inline-spec.ts`
- Create: `blocksuite/affine/inlines/preset/src/page-inline-manager.ts`
- Modify: `blocksuite/affine/inlines/preset/src/view.ts`
- Modify: `blocksuite/affine/inlines/preset/src/index.ts`

- [ ] **Step 1: Add a hashtag-aware inline spec**

```ts
const HASHTAG_PATTERN = /#[^\s]+/g;

function splitHashtagText(text: string) {
  const segments: Array<{ text: string; hashtag: boolean }> = [];
  let lastIndex = 0;

  for (const match of text.matchAll(HASHTAG_PATTERN)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, index), hashtag: false });
    }
    segments.push({ text: match[0], hashtag: true });
    lastIndex = index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), hashtag: false });
  }

  return segments;
}

export const PageHashtagInlineSpecExtension = InlineSpecExtension<AffineTextAttributes>({
  name: 'page-hashtag',
  schema: z.object({}),
  match: delta => {
    return !delta.attributes?.code && HASHTAG_PATTERN.test(delta.insert);
  },
  renderer: ({ delta }) => {
    const baseStyle = affineTextStyles(delta.attributes ?? {});
    const badgeStyle = affineTextStyles(delta.attributes ?? {}, {
      'background-color': 'var(--affine-background-secondary-color)',
      border: '1px solid var(--affine-border-color)',
      'border-radius': '999px',
      display: 'inline-block',
      padding: '0 6px',
    });

    return html`${splitHashtagText(delta.insert).map(
      segment =>
        html`<span class=${segment.hashtag ? 'affine-page-hashtag-badge' : nothing} style=${styleMap(segment.hashtag ? badgeStyle : baseStyle)}>
          <v-text .str=${segment.text}></v-text>
        </span>`
    )}`;
  },
});
```

- [ ] **Step 2: Add a page-only inline manager**

```ts
export const PageInlineManagerExtension = InlineManagerExtension<AffineTextAttributes>({
  id: 'PageInlineManager',
  specs: [BoldInlineSpecExtension.identifier, ItalicInlineSpecExtension.identifier, UnderlineInlineSpecExtension.identifier, StrikeInlineSpecExtension.identifier, CodeInlineSpecExtension.identifier, BackgroundInlineSpecExtension.identifier, ColorInlineSpecExtension.identifier, PageHashtagInlineSpecExtension.identifier, LatexInlineSpecExtension.identifier, ReferenceInlineSpecExtension.identifier, LinkInlineSpecExtension.identifier, FootNoteInlineSpecExtension.identifier, MentionInlineSpecExtension.identifier, CommentInlineSpecExtension.identifier],
});
```

- [ ] **Step 3: Register and export the page manager**

```ts
context.register(PageInlineManagerExtension);
```

```ts
export * from './page-inline-manager';
```

- [ ] **Step 4: Run tests to verify partial progress**

Run: `yarn --cwd tests/blocksuite playwright test e2e/page-hashtag.spec.ts`

Expected: still FAIL because paragraph/list blocks still use the shared default manager.

### Task 3: Switch page-mode paragraph/list blocks to the page manager

**Files:**

- Modify: `blocksuite/affine/blocks/paragraph/src/paragraph-block.ts`
- Modify: `blocksuite/affine/blocks/list/src/list-block.ts`

- [ ] **Step 1: Select the page manager only in page mode**

```ts
get inlineManager() {
  const mode = this.std.get(DocModeProvider).getEditorMode();
  return this.std.get(
    mode === 'page'
      ? PageInlineManagerExtension.identifier
      : DefaultInlineManagerExtension.identifier
  );
}
```

- [ ] **Step 2: Run the focused test file**

Run: `yarn --cwd tests/blocksuite playwright test e2e/page-hashtag.spec.ts`

Expected: PASS

- [ ] **Step 3: Run nearby regression coverage**

Run: `yarn --cwd tests/blocksuite playwright test e2e/paragraph.spec.ts e2e/list.spec.ts e2e/selection/native.spec.ts`

Expected: PASS
