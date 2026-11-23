/**
 * @vitest-environment happy-dom
 */
import type { TextSelection } from '@blocksuite/std';
import { describe, expect, it } from 'vitest';

import { replaceSelectedTextWithBlocksCommand } from '../../../commands/model-crud/replace-selected-text-with-blocks';
import { affine, block } from '../../../test-utils';

describe('commands/model-crud', () => {
  describe('replaceSelectedTextWithBlocksCommand', () => {
    it('should replace selected text with blocks when both first and last blocks are mergable blocks', () => {
      const host = affine`
        <affine-page id="page">
          <affine-note id="note">
            <affine-paragraph id="paragraph-1">Hel<anchor />lo</affine-paragraph>
            <affine-paragraph id="paragraph-2">Wor<focus />ld</affine-paragraph>
          </affine-note>
        </affine-page>
      `;

      const blocks = [
        block`<affine-paragraph id="111">111</affine-paragraph>`,
        block`<affine-code id="code"></affine-code>`,
        block`<affine-paragraph id="222">222</affine-paragraph>`,
      ]
        .filter((b): b is NonNullable<typeof b> => b !== null)
        .map(b => b.model);

      const textSelection = host.selection.value[0] as TextSelection;

      host.command.exec(replaceSelectedTextWithBlocksCommand, {
        textSelection,
        blocks,
      });

      const expected = affine`
        <affine-page id="page">
          <affine-note id="note">
            <affine-paragraph id="paragraph-1">Hel111</affine-paragraph>
            <affine-code id="code"></affine-code>
            <affine-paragraph id="paragraph-2">222ld</affine-paragraph>
          </affine-note>
        </affine-page>
      `;

      expect(host.store).toEqualDoc(expected.store);
    });

    it('should replace selected text with blocks when both first and last blocks are mergable blocks in single paragraph', () => {
      const host = affine`
        <affine-page id="page">
          <affine-note id="note">
            <affine-paragraph id="paragraph-1">Hel<anchor></anchor>lo Wor<focus></focus>ld</affine-paragraph>
          </affine-note>
        </affine-page>
      `;

      const blocks = [
        block`<affine-paragraph id="111">111</affine-paragraph>`,
        block`<affine-code id="code"></affine-code>`,
        block`<affine-paragraph id="222">222</affine-paragraph>`,
      ]
        .filter((b): b is NonNullable<typeof b> => b !== null)
        .map(b => b.model);

      const textSelection = host.selection.value[0] as TextSelection;

      host.command.exec(replaceSelectedTextWithBlocksCommand, {
        textSelection,
        blocks,
      });

      const expected = affine`
        <affine-page id="page">
          <affine-note id="note">
            <affine-paragraph id="paragraph-1">Hel111</affine-paragraph>
            <affine-code id="code"></affine-code>
            <affine-paragraph id="222">222ld</affine-paragraph>
          </affine-note>
        </affine-page>
      `;

      expect(host.store).toEqualDoc(expected.store);
    });

    it('should replace selected text with blocks when blocks contains only one mergable block', () => {
      const host = affine`
        <affine-page id="page">
          <affine-note id="note">
            <affine-paragraph id="paragraph-1">Hel<anchor />lo</affine-paragraph>
            <affine-paragraph id="paragraph-2">Wor<focus />ld</affine-paragraph>
          </affine-note>
        </affine-page>
      `;

      const blocks = [block`<affine-paragraph id="111">111</affine-paragraph>`]
        .filter((b): b is NonNullable<typeof b> => b !== null)
        .map(b => b.model);

      const textSelection = host.selection.value[0] as TextSelection;

      host.command.exec(replaceSelectedTextWithBlocksCommand, {
        textSelection,
        blocks,
      });

      const expected = affine`
        <affine-page id="page">
          <affine-note id="note">
            <affine-paragraph id="paragraph-1">Hel111ld</affine-paragraph>
          </affine-note>
        </affine-page>
      `;

      expect(host.store).toEqualDoc(expected.store);
    });

    it('should replace selected text with blocks when blocks contains only one mergable block in single paragraph', () => {
      const host = affine`
        <affine-page id="page">
          <affine-note id="note">
            <affine-paragraph id="paragraph-1">Hel<anchor></anchor>lo Wor<focus></focus>ld</affine-paragraph>
          </affine-note>
        </affine-page>
      `;

      const blocks = [block`<affine-paragraph id="111">111</affine-paragraph>`]
        .filter((b): b is NonNullable<typeof b> => b !== null)
        .map(b => b.model);

      const textSelection = host.selection.value[0] as TextSelection;

      host.command.exec(replaceSelectedTextWithBlocksCommand, {
        textSelection,
        blocks,
      });

      const expected = affine`
        <affine-page id="page">
          <affine-note id="note">
            <affine-paragraph id="paragraph-1">Hel111ld</affine-paragraph>
          </affine-note>
        </affine-page>
      `;

      expect(host.store).toEqualDoc(expected.store);
    });

    it('should replace selected text with blocks when only first block is mergable block', () => {
      const host = affine`
        <affine-page>
          <affine-note>
            <affine-paragraph>Hel<anchor />lo</affine-paragraph>
            <affine-paragraph>Wor<focus />ld</affine-paragraph>
          </affine-note>
        </affine-page>
      `;

      const blocks = [
        block`<affine-paragraph>111</affine-paragraph>`,
        block`<affine-code></affine-code>`,
        block`<affine-code></affine-code>`,
      ]
        .filter((b): b is NonNullable<typeof b> => b !== null)
        .map(b => b.model);

      const textSelection = host.selection.value[0] as TextSelection;

      host.command.exec(replaceSelectedTextWithBlocksCommand, {
        textSelection,
        blocks,
      });

      const expected = affine`
        <affine-page>
          <affine-note >
            <affine-paragraph>Hel111</affine-paragraph>
            <affine-code></affine-code>
            <affine-code></affine-code>
            <affine-paragraph>ld</affine-paragraph>
          </affine-note>
        </affine-page>
      `;

      expect(host.store).toEqualDoc(expected.store);
    });

    it('should replace selected text with blocks when only first block is mergable block in single paragraph', () => {
      const host = affine`
        <affine-page>
          <affine-note>
            <affine-paragraph>Hel<anchor></anchor>lo Wor<focus></focus>ld</affine-paragraph>
          </affine-note>
        </affine-page>
      `;

      const blocks = [
        block`<affine-paragraph>111</affine-paragraph>`,
        block`<affine-code></affine-code>`,
        block`<affine-code></affine-code>`,
      ]
        .filter((b): b is NonNullable<typeof b> => b !== null)
        .map(b => b.model);

      const textSelection = host.selection.value[0] as TextSelection;

      host.command.exec(replaceSelectedTextWithBlocksCommand, {
        textSelection,
        blocks,
      });

      const expected = affine`
        <affine-page>
          <affine-note>
            <affine-paragraph>Hel111</affine-paragraph>
            <affine-code></affine-code>
            <affine-code></affine-code>
            <affine-paragraph>ld</affine-paragraph>
          </affine-note>
        </affine-page>
      `;

      expect(host.store).toEqualDoc(expected.store);
    });

    it('should replace selected text with blocks when only last block is mergable block', () => {
      const host = affine`
        <affine-page>
          <affine-note>
            <affine-paragraph>Hel<anchor />lo</affine-paragraph>
            <affine-paragraph>Wor<focus />ld</affine-paragraph>
          </affine-note>
        </affine-page>
      `;

      const blocks = [
        block`<affine-code></affine-code>`,
        block`<affine-code></affine-code>`,
        block`<affine-paragraph>111</affine-paragraph>`,
      ]
        .filter((b): b is NonNullable<typeof b> => b !== null)
        .map(b => b.model);

      const textSelection = host.selection.value[0] as TextSelection;

      host.command.exec(replaceSelectedTextWithBlocksCommand, {
        textSelection,
        blocks,
      });

      const expected = affine`
        <affine-page>
          <affine-note >
            <affine-paragraph>Hel</affine-paragraph>
            <affine-code></affine-code>
            <affine-code></affine-code>
            <affine-paragraph>111ld</affine-paragraph>
          </affine-note>
        </affine-page>
      `;
      expect(host.store).toEqualDoc(expected.store);
    });

    it('should replace selected text with blocks when only last block is mergable block in single paragraph', () => {
      const host = affine`
        <affine-page>
          <affine-note>
            <affine-paragraph>Hel<anchor></anchor>lo Wor<focus></focus>ld</affine-paragraph>
          </affine-note>
        </affine-page>
      `;

      const blocks = [
        block`<affine-code></affine-code>`,
        block`<affine-code></affine-code>`,
        block`<affine-paragraph>111</affine-paragraph>`,
      ]
        .filter((b): b is NonNullable<typeof b> => b !== null)
        .map(b => b.model);

      const textSelection = host.selection.value[0] as TextSelection;

      host.command.exec(replaceSelectedTextWithBlocksCommand, {
        textSelection,
        blocks,
      });

      const expected = affine`
        <affine-page>
          <affine-note>
            <affine-paragraph>Hel</affine-paragraph>
            <affine-code></affine-code>
            <affine-code></affine-code>
            <affine-paragraph>111ld</affine-paragraph>
          </affine-note>
        </affine-page>
      `;
      expect(host.store).toEqualDoc(expected.store);
    });

    it('should replace selected text with blocks when neither first nor last block is mergable block', () => {
      const host = affine`
        <affine-page>
          <affine-note>
            <affine-paragraph>Hel<anchor />lo</affine-paragraph>
            <affine-paragraph>Wor<focus />ld</affine-paragraph>
          </affine-note>
        </affine-page>
      `;

      const blocks = [
        block`<affine-code></affine-code>`,
        block`<affine-code></affine-code>`,
      ]
        .filter((b): b is NonNullable<typeof b> => b !== null)
        .map(b => b.model);

      const textSelection = host.selection.value[0] as TextSelection;

      host.command.exec(replaceSelectedTextWithBlocksCommand, {
        textSelection,
        blocks,
      });

      const expected = affine`
        <affine-page>
          <affine-note >
            <affine-paragraph>Hel</affine-paragraph>
            <affine-code></affine-code>
            <affine-code></affine-code>
            <affine-paragraph>ld</affine-paragraph>
          </affine-note>
        </affine-page>
      `;
      expect(host.store).toEqualDoc(expected.store);
    });

    it('should replace selected text with blocks when neither first nor last block is mergable block in single paragraph', () => {
      const host = affine`
        <affine-page>
          <affine-note>
            <affine-paragraph>Hel<anchor></anchor>lo Wor<focus></focus>ld</affine-paragraph>
          </affine-note>
        </affine-page>
      `;

      const blocks = [
        block`<affine-code></affine-code>`,
        block`<affine-code></affine-code>`,
      ]
        .filter((b): b is NonNullable<typeof b> => b !== null)
        .map(b => b.model);

      const textSelection = host.selection.value[0] as TextSelection;

      host.command.exec(replaceSelectedTextWithBlocksCommand, {
        textSelection,
        blocks,
      });

      const expected = affine`
        <affine-page>
          <affine-note>
            <affine-paragraph>Hel</affine-paragraph>
            <affine-code></affine-code>
            <affine-code></affine-code>
            <affine-paragraph>ld</affine-paragraph>
          </affine-note>
        </affine-page>
      `;
      expect(host.store).toEqualDoc(expected.store);
    });

    it('should replace selected text with blocks when both first and last blocks are mergable blocks with different types', () => {
      const host = affine`
        <affine-page>
          <affine-note>
            <affine-paragraph>Hel<anchor />lo</affine-paragraph>
            <affine-paragraph>Wor<focus />ld</affine-paragraph>
          </affine-note>
        </affine-page>
      `;

      const blocks = [
        block`<affine-list>1.</affine-list>`,
        block`<affine-list>2.</affine-list>`,
      ]
        .filter((b): b is NonNullable<typeof b> => b !== null)
        .map(b => b.model);

      const textSelection = host.selection.value[0] as TextSelection;

      host.command.exec(replaceSelectedTextWithBlocksCommand, {
        textSelection,
        blocks,
      });

      const expected = affine`
        <affine-page>
          <affine-note >
            <affine-paragraph>Hel</affine-paragraph>
            <affine-list>1.</affine-list>
            <affine-list>2.</affine-list>
            <affine-paragraph>ld</affine-paragraph>
          </affine-note>
        </affine-page>
      `;
      expect(host.store).toEqualDoc(expected.store);
    });

    it('should replace selected text with blocks when both first and last blocks are paragraphs, and cursor is at the end of the text-block with different types', () => {
      const host = affine`
        <affine-page>
          <affine-note>
            <affine-list>Hel<anchor />lo</affine-list>
            <affine-list>Wor<focus />ld</affine-list>
          </affine-note>
        </affine-page>
      `;

      const blocks = [
        block`<affine-paragraph>111</affine-paragraph>`,
        block`<affine-paragraph>222</affine-paragraph>`,
      ]
        .filter((b): b is NonNullable<typeof b> => b !== null)
        .map(b => b.model);

      const textSelection = host.selection.value[0] as TextSelection;

      host.command.exec(replaceSelectedTextWithBlocksCommand, {
        textSelection,
        blocks,
      });

      const expected = affine`
        <affine-page>
          <affine-note >
            <affine-list>Hel111</affine-list>
            <affine-list>222ld</affine-list>
          </affine-note>
        </affine-page>
      `;
      expect(host.store).toEqualDoc(expected.store);
    });

    it('should replace selected text with blocks when first block is paragraph, and cursor is at the end of the text-block with different type  ', () => {
      const host = affine`
        <affine-page>
          <affine-note>
            <affine-list>Hel<anchor />lo</affine-list>
            <affine-list>Wor<focus />ld</affine-list>
          </affine-note>
        </affine-page>
      `;

      const blocks = [
        block`<affine-paragraph>111</affine-paragraph>`,
        block`<affine-code></affine-code>`,
      ]
        .filter((b): b is NonNullable<typeof b> => b !== null)
        .map(b => b.model);

      const textSelection = host.selection.value[0] as TextSelection;

      host.command.exec(replaceSelectedTextWithBlocksCommand, {
        textSelection,
        blocks,
      });

      const expected = affine`
        <affine-page>
          <affine-note >
            <affine-list>Hel111</affine-list>
            <affine-code></affine-code>
            <affine-list>ld</affine-list>
          </affine-note>
        </affine-page>
      `;
      expect(host.store).toEqualDoc(expected.store);
    });

    it('should replace selected text with blocks when last block is paragraph, and cursor is at the end of the text-block with different type  ', () => {
      const host = affine`
        <affine-page>
          <affine-note>
            <affine-list>Hel<anchor />lo</affine-list>
            <affine-list>Wor<focus />ld</affine-list>
          </affine-note>
        </affine-page>
      `;

      const blocks = [
        block`<affine-code></affine-code>`,
        block`<affine-paragraph>222</affine-paragraph>`,
      ]
        .filter((b): b is NonNullable<typeof b> => b !== null)
        .map(b => b.model);

      const textSelection = host.selection.value[0] as TextSelection;

      host.command.exec(replaceSelectedTextWithBlocksCommand, {
        textSelection,
        blocks,
      });

      const expected = affine`
        <affine-page>
          <affine-note >
            <affine-list>Hel</affine-list>
            <affine-code></affine-code>
            <affine-list>222ld</affine-list>
          </affine-note>
        </affine-page>
      `;
      expect(host.store).toEqualDoc(expected.store);
    });
  });
});
