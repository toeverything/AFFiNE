import {
  BoldItalicMarkdown,
  BoldMarkdown,
  CodeExtension,
  ItalicExtension,
  StrikethroughExtension,
  UnderthroughExtension,
} from '@blocksuite/affine-inline-preset';
import type { AffineTextAttributes } from '@blocksuite/affine-shared/types';
import { Container, type ServiceIdentifier } from '@blocksuite/global/di';
import type { InlineMarkdownMatch } from '@blocksuite/std/inline';
import type { ExtensionType } from '@blocksuite/store';
import { describe, expect, test, vi } from 'vitest';

type MarkdownExtension = ExtensionType & {
  identifier: ServiceIdentifier<InlineMarkdownMatch<AffineTextAttributes>>;
};

class MockInlineEditor {
  text: string;
  inlineRange: { index: number; length: number } | null = null;
  attrs: Array<AffineTextAttributes | undefined>;

  constructor(text: string) {
    this.text = text;
    this.attrs = Array.from({ length: text.length }, () => undefined);
  }

  get yTextString() {
    return this.text;
  }

  formatText(
    range: { index: number; length: number },
    attrs: AffineTextAttributes
  ) {
    for (let i = 0; i < range.length; i += 1) {
      const idx = range.index + i;
      this.attrs[idx] = { ...this.attrs[idx], ...attrs };
    }
  }

  deleteText(range: { index: number; length: number }) {
    this.text =
      this.text.slice(0, range.index) +
      this.text.slice(range.index + range.length);
    this.attrs.splice(range.index, range.length);
  }

  setInlineRange(range: { index: number; length: number }) {
    this.inlineRange = range;
  }

  insertText(range: { index: number; length: number }, text: string) {
    this.text =
      this.text.slice(0, range.index) + text + this.text.slice(range.index);
    this.attrs.splice(
      range.index,
      0,
      ...Array.from({ length: text.length }, () => undefined)
    );
    this.inlineRange = {
      index: range.index + text.length,
      length: 0,
    };
  }
}

function getMatcher(extension: MarkdownExtension) {
  const container = new Container();
  extension.setup(container);
  return container.provider().get(extension.identifier);
}

const markerCases = [
  {
    name: 'bolditalic',
    extension: BoldItalicMarkdown,
    left: '***',
    right: '***',
    attrKey: 'bold' as const,
  },
  {
    name: 'bold',
    extension: BoldMarkdown,
    left: '**',
    right: '**',
    attrKey: 'bold' as const,
  },
  {
    name: 'italic',
    extension: ItalicExtension,
    left: '*',
    right: '*',
    attrKey: 'italic' as const,
  },
  {
    name: 'strikethrough',
    extension: StrikethroughExtension,
    left: '~~',
    right: '~~',
    attrKey: 'strike' as const,
  },
  {
    name: 'underline',
    extension: UnderthroughExtension,
    left: '~',
    right: '~',
    attrKey: 'underline' as const,
  },
  {
    name: 'code',
    extension: CodeExtension,
    left: '`',
    right: '`',
    attrKey: 'code' as const,
  },
];

const textCases = [
  { name: 'single-char target', prefix: '', target: 'x' },
  { name: 'multi-char target', prefix: '', target: 'hello' },
  { name: 'prefixed target', prefix: 'pre ', target: 'world' },
];

describe('inline markdown space-preservation', () => {
  for (const markerCase of markerCases) {
    const matcher = getMatcher(markerCase.extension);

    for (const textCase of textCases) {
      test(`${markerCase.name}: ${textCase.name}`, () => {
        const source = `${textCase.prefix}${markerCase.left}${textCase.target}${markerCase.right} `;
        const expected = `${textCase.prefix}${textCase.target} `;
        const editor = new MockInlineEditor(source);
        const undoManager = {
          stopCapturing: vi.fn(),
        };

        matcher.action({
          inlineEditor: editor as never,
          prefixText: source,
          inlineRange: { index: source.length, length: 0 },
          pattern: matcher.pattern,
          undoManager: undoManager as never,
        });

        expect(undoManager.stopCapturing).toHaveBeenCalledTimes(1);
        expect(editor.text).toBe(expected);
        expect(editor.inlineRange).toEqual({
          index: expected.length,
          length: 0,
        });

        const targetStart = textCase.prefix.length;
        for (let i = 0; i < textCase.target.length; i += 1) {
          expect(editor.attrs[targetStart + i]?.[markerCase.attrKey]).toBe(
            true
          );
        }
        expect(
          editor.attrs[expected.length - 1]?.[markerCase.attrKey]
        ).toBeUndefined();

        editor.insertText(
          {
            index: editor.inlineRange!.index,
            length: 0,
          },
          'z'
        );
        expect(editor.text).toBe(`${expected}z`);
        expect(
          editor.attrs[editor.text.length - 1]?.[markerCase.attrKey]
        ).toBeUndefined();
      });
    }

    test(`${markerCase.name}: keeps existing suffix unformatted`, () => {
      const target = 'abc';
      const suffix = 'suffix';
      const trigger = `${markerCase.left}${target}${markerCase.right} `;
      const source = `${trigger}${suffix}`;
      const expected = `${target} ${suffix}`;
      const editor = new MockInlineEditor(source);
      const undoManager = {
        stopCapturing: vi.fn(),
      };

      matcher.action({
        inlineEditor: editor as never,
        prefixText: trigger,
        inlineRange: { index: trigger.length, length: 0 },
        pattern: matcher.pattern,
        undoManager: undoManager as never,
      });

      expect(undoManager.stopCapturing).toHaveBeenCalledTimes(1);
      expect(editor.text).toBe(expected);
      expect(editor.inlineRange).toEqual({
        index: target.length + 1,
        length: 0,
      });

      for (let i = 0; i < target.length; i += 1) {
        expect(editor.attrs[i]?.[markerCase.attrKey]).toBe(true);
      }
      for (let i = target.length + 1; i < expected.length; i += 1) {
        expect(editor.attrs[i]?.[markerCase.attrKey]).toBeUndefined();
      }
    });
  }
});
