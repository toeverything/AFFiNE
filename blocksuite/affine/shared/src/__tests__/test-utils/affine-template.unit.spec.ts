import { TextSelection } from '@blocksuite/std';
import { describe, expect, it } from 'vitest';

import { affine } from '../../test-utils';

describe('helpers/affine-template', () => {
  it('should create a basic document structure from template', () => {
    const host = affine`
      <affine-page id="page">
        <affine-note id="note">
          <affine-paragraph id="paragraph-1">Hello, world</affine-paragraph>
        </affine-note>
      </affine-page>
    `;

    expect(host.store).toBeDefined();

    const pageBlock = host.store.getBlock('page');
    expect(pageBlock).toBeDefined();
    expect(pageBlock?.flavour).toBe('affine:page');

    const noteBlock = host.store.getBlock('note');
    expect(noteBlock).toBeDefined();
    expect(noteBlock?.flavour).toBe('affine:note');

    const paragraphBlock = host.store.getBlock('paragraph-1');
    expect(paragraphBlock).toBeDefined();
    expect(paragraphBlock?.flavour).toBe('affine:paragraph');
  });

  it('should handle nested blocks correctly', () => {
    const host = affine`
      <affine-page>
        <affine-note>
          <affine-paragraph>First paragraph</affine-paragraph>
          <affine-list>List item</affine-list>
          <affine-paragraph>Second paragraph</affine-paragraph>
        </affine-note>
      </affine-page>
    `;

    const noteBlocks = host.store.getBlocksByFlavour('affine:note');
    const paragraphBlocks = host.store.getBlocksByFlavour('affine:paragraph');
    const listBlocks = host.store.getBlocksByFlavour('affine:list');

    expect(noteBlocks.length).toBe(1);
    expect(paragraphBlocks.length).toBe(2);
    expect(listBlocks.length).toBe(1);

    const noteBlock = noteBlocks[0];
    const noteChildren =
      host.store.getBlock(noteBlock.id)?.model.children || [];
    expect(noteChildren.length).toBe(3);

    expect(noteChildren[0].flavour).toBe('affine:paragraph');
    expect(noteChildren[1].flavour).toBe('affine:list');
    expect(noteChildren[2].flavour).toBe('affine:paragraph');
  });

  it('should handle empty blocks correctly', () => {
    const host = affine`
      <affine-page>
        <affine-note>
          <affine-paragraph></affine-paragraph>
        </affine-note>
      </affine-page>
    `;

    const paragraphBlocks = host.store.getBlocksByFlavour('affine:paragraph');
    expect(paragraphBlocks.length).toBe(1);

    const paragraphBlock = host.store.getBlock(paragraphBlocks[0].id);
    const paragraphText = paragraphBlock?.model.text?.toString() || '';
    expect(paragraphText).toBe('');
  });

  it('should throw error on invalid template', () => {
    expect(() => {
      affine`
        <unknown-tag></unknown-tag>
      `;
    }).toThrow();
  });

  it('should handle text selection with anchor and focus', () => {
    const host = affine`
      <affine-page id="page">
        <affine-note id="note">
          <affine-paragraph id="paragraph-1">Hel<anchor />lo</affine-paragraph>
          <affine-paragraph id="paragraph-2">Wo<focus />rld</affine-paragraph>
        </affine-note>
      </affine-page>
    `;

    const selection = host.selection.value[0] as TextSelection;
    expect(selection).toBeDefined();
    expect(selection.is(TextSelection)).toBe(true);
    expect(selection.from.blockId).toBe('paragraph-1');
    expect(selection.from.index).toBe(3);
    expect(selection.from.length).toBe(2);
    expect(selection.to?.blockId).toBe('paragraph-2');
    expect(selection.to?.index).toBe(0);
    expect(selection.to?.length).toBe(2);
  });

  it('should handle cursor position', () => {
    const host = affine`
      <affine-page id="page">
        <affine-note id="note">
          <affine-paragraph id="paragraph-1">Hello<cursor />World</affine-paragraph>
        </affine-note>
      </affine-page>
    `;

    const selection = host.selection.value[0] as TextSelection;
    expect(selection).toBeDefined();
    expect(selection.is(TextSelection)).toBe(true);
    expect(selection.from.blockId).toBe('paragraph-1');
    expect(selection.from.index).toBe(5);
    expect(selection.from.length).toBe(0);
    expect(selection.to).toBeNull();
  });

  it('should handle selection in empty blocks', () => {
    const host = affine`
      <affine-page id="page">
        <affine-note id="note">
          <affine-paragraph id="paragraph-1"><cursor /></affine-paragraph>
        </affine-note>
      </affine-page>
    `;

    const selection = host.selection.value[0] as TextSelection;
    expect(selection).toBeDefined();
    expect(selection.is(TextSelection)).toBe(true);
    expect(selection.from.blockId).toBe('paragraph-1');
    expect(selection.from.index).toBe(0);
    expect(selection.from.length).toBe(0);
    expect(selection.to).toBeNull();
  });

  it('should handle single point selection', () => {
    const host = affine`
      <affine-page id="page">
        <affine-note id="note">
          <affine-paragraph id="paragraph-1">Hello<anchor></anchor>World<focus></focus>Affine</affine-paragraph>
        </affine-note>
      </affine-page>
    `;

    const selection = host.selection.value[0] as TextSelection;
    expect(selection).toBeDefined();
    expect(selection.is(TextSelection)).toBe(true);
    expect(selection.from.blockId).toBe('paragraph-1');
    expect(selection.from.index).toBe(5);
    expect(selection.from.length).toBe(5);
    expect(selection.to).toBeNull();
  });
});
