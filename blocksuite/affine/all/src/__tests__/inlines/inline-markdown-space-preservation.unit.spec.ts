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

/**
 * Minimal inline-editor test double for markdown matcher actions.
 * It tracks plain text, per-character attributes, and caret position.
 */
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
      this.text.slice(0, range.index) +
      text +
      this.text.slice(range.index + range.length);
    this.attrs.splice(
      range.index,
      range.length,
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

/**
 * Regression cases for inline markdown triggers that should:
 * 1) keep the typed trailing space,
 * 2) place caret after that space,
 * 3) stop style propagation into subsequent plain text.
 */
const markerCases = [
  {
    name: 'bolditalic',
    extension: BoldItalicMarkdown,
    left: '***',
    right: '***',
    attrKeys: ['bold', 'italic'] as const,
  },
  {
    name: 'bold',
    extension: BoldMarkdown,
    left: '**',
    right: '**',
    attrKeys: ['bold'] as const,
  },
  {
    name: 'italic',
    extension: ItalicExtension,
    left: '*',
    right: '*',
    attrKeys: ['italic'] as const,
  },
  {
    name: 'strikethrough',
    extension: StrikethroughExtension,
    left: '~~',
    right: '~~',
    attrKeys: ['strike'] as const,
  },
  {
    name: 'underline',
    extension: UnderthroughExtension,
    left: '~',
    right: '~',
    attrKeys: ['underline'] as const,
  },
  {
    name: 'code',
    extension: CodeExtension,
    left: '`',
    right: '`',
    attrKeys: ['code'] as const,
  },
];

const textCases = [
  { name: 'single-char target', prefix: '', target: 'x' },
  { name: 'multi-char target', prefix: '', target: 'hello' },
  { name: 'prefixed target', prefix: 'pre ', target: 'world' },
];

describe('inline markdown space-preservation', () => {
  for (const markerCase of markerCases) {
    for (const textCase of textCases) {
      test(`${markerCase.name}: ${textCase.name}`, () => {
        const matcher = getMatcher(markerCase.extension);
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
        for (const attrKey of markerCase.attrKeys) {
          for (let i = 0; i < textCase.target.length; i += 1) {
            expect(editor.attrs[targetStart + i]?.[attrKey]).toBe(true);
          }
          expect(editor.attrs[expected.length - 1]?.[attrKey]).toBeUndefined();
        }

        editor.insertText(
          {
            index: editor.inlineRange!.index,
            length: 0,
          },
          'z'
        );
        expect(editor.text).toBe(`${expected}z`);
        for (const attrKey of markerCase.attrKeys) {
          expect(
            editor.attrs[editor.text.length - 1]?.[attrKey]
          ).toBeUndefined();
        }
      });
    }

    test(`${markerCase.name}: keeps existing suffix unformatted`, () => {
      const matcher = getMatcher(markerCase.extension);
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

      for (const attrKey of markerCase.attrKeys) {
        for (let i = 0; i < target.length; i += 1) {
          expect(editor.attrs[i]?.[attrKey]).toBe(true);
        }
        for (let i = target.length; i < expected.length; i += 1) {
          expect(editor.attrs[i]?.[attrKey]).toBeUndefined();
        }
      }
    });
  }
});
