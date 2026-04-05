import { DocModeProvider } from '@blocksuite/affine-shared/services';
import { affineTextStyles } from '@blocksuite/affine-shared/styles';
import type { AffineTextAttributes } from '@blocksuite/affine-shared/types';
import { type BlockComponent, StdIdentifier } from '@blocksuite/std';
import {
  type InlineRootElement,
  InlineSpecExtension,
} from '@blocksuite/std/inline';
import type { ExtensionType } from '@blocksuite/store';
import { html } from 'lit';
import { styleMap } from 'lit/directives/style-map.js';
import { z } from 'zod';

export type AffineInlineRootElement = InlineRootElement<AffineTextAttributes>;

const HASHTAG_MATCHER = /#[^\s]+/;
const HASHTAG_SEGMENTER = /#[^\s]+/g;

function splitHashtagText(text: string) {
  const segments: Array<{ text: string; hashtag: boolean }> = [];
  let lastIndex = 0;

  for (const match of text.matchAll(HASHTAG_SEGMENTER)) {
    const index = match.index ?? 0;

    if (index > lastIndex) {
      segments.push({
        text: text.slice(lastIndex, index),
        hashtag: false,
      });
    }

    segments.push({
      text: match[0],
      hashtag: true,
    });
    lastIndex = index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({
      text: text.slice(lastIndex),
      hashtag: false,
    });
  }

  return segments;
}

export const BoldInlineSpecExtension =
  InlineSpecExtension<AffineTextAttributes>({
    name: 'bold',
    schema: z.object({
      bold: z.literal(true).optional().nullable().catch(undefined),
    }),
    match: delta => {
      return !!delta.attributes?.bold;
    },
    renderer: ({ delta }) => {
      return html`<affine-text .delta=${delta}></affine-text>`;
    },
  });

export const ItalicInlineSpecExtension =
  InlineSpecExtension<AffineTextAttributes>({
    name: 'italic',
    schema: z.object({
      italic: z.literal(true).optional().nullable().catch(undefined),
    }),
    match: delta => {
      return !!delta.attributes?.italic;
    },
    renderer: ({ delta }) => {
      return html`<affine-text .delta=${delta}></affine-text>`;
    },
  });

export const UnderlineInlineSpecExtension =
  InlineSpecExtension<AffineTextAttributes>({
    name: 'underline',
    schema: z.object({
      underline: z.literal(true).optional().nullable().catch(undefined),
    }),
    match: delta => {
      return !!delta.attributes?.underline;
    },
    renderer: ({ delta }) => {
      return html`<affine-text .delta=${delta}></affine-text>`;
    },
  });

export const StrikeInlineSpecExtension =
  InlineSpecExtension<AffineTextAttributes>({
    name: 'strike',
    schema: z.object({
      strike: z.literal(true).optional().nullable().catch(undefined),
    }),
    match: delta => {
      return !!delta.attributes?.strike;
    },
    renderer: ({ delta }) => {
      return html`<affine-text .delta=${delta}></affine-text>`;
    },
  });

export const CodeInlineSpecExtension =
  InlineSpecExtension<AffineTextAttributes>({
    name: 'inline-code',
    schema: z.object({
      code: z.literal(true).optional().nullable().catch(undefined),
    }),
    match: delta => {
      return !!delta.attributes?.code;
    },
    renderer: ({ delta }) => {
      return html`<affine-text .delta=${delta}></affine-text>`;
    },
  });

export const BackgroundInlineSpecExtension =
  InlineSpecExtension<AffineTextAttributes>({
    name: 'background',
    schema: z.object({
      background: z.string().optional().nullable().catch(undefined),
    }),
    match: delta => {
      return !!delta.attributes?.background;
    },
    renderer: ({ delta }) => {
      return html`<affine-text .delta=${delta}></affine-text>`;
    },
  });

export const ColorInlineSpecExtension =
  InlineSpecExtension<AffineTextAttributes>({
    name: 'color',
    schema: z.object({
      color: z.string().optional().nullable().catch(undefined),
    }),
    match: delta => {
      return !!delta.attributes?.color;
    },
    renderer: ({ delta }) => {
      return html`<affine-text .delta=${delta}></affine-text>`;
    },
  });

export const PageHashtagInlineSpecExtension =
  InlineSpecExtension<AffineTextAttributes>('page-hashtag', provider => {
    const std = provider.get(StdIdentifier);

    return {
      name: 'page-hashtag',
      schema: z.object({}),
      match: delta => {
        return (
          typeof delta.insert === 'string' &&
          !delta.attributes?.code &&
          delta.insert.includes('#') &&
          HASHTAG_MATCHER.test(delta.insert)
        );
      },
      renderer: ({ delta, editor }) => {
        const block =
          editor.rootElement?.closest<BlockComponent>('[data-block-id]');

        if (
          std.get(DocModeProvider).getEditorMode() !== 'page' ||
          (block?.flavour !== 'affine:paragraph' &&
            block?.flavour !== 'affine:list')
        ) {
          return html`<affine-text .delta=${delta}></affine-text>`;
        }

        const attributes = delta.attributes ?? {};
        const baseStyle = affineTextStyles(attributes);

        return html`${splitHashtagText(delta.insert).map(segment => {
          if (!segment.hashtag) {
            return html`<span style=${styleMap(baseStyle)}
              ><v-text .str=${segment.text}></v-text
            ></span>`;
          }

          return html`<affine-page-hashtag
            .delta=${{
              ...delta,
              insert: segment.text,
            }}
          ></affine-page-hashtag>`;
        })}`;
      },
    };
  });

export const InlineSpecExtensions: ExtensionType[] = [
  BoldInlineSpecExtension,
  ItalicInlineSpecExtension,
  UnderlineInlineSpecExtension,
  StrikeInlineSpecExtension,
  CodeInlineSpecExtension,
  BackgroundInlineSpecExtension,
  ColorInlineSpecExtension,
  PageHashtagInlineSpecExtension,
];
