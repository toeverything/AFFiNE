import type { AffineTextAttributes } from '@blocksuite/affine-shared/types';
import {
  type InlineRootElement,
  InlineSpecExtension,
} from '@blocksuite/std/inline';
import type { ExtensionType } from '@blocksuite/store';
import { html } from 'lit';
import { z } from 'zod';

export type AffineInlineRootElement = InlineRootElement<AffineTextAttributes>;

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

/**
 * Obsidian ==highlight== inline spec.
 * Renders via affine-text using the highlight CSS token as background-color.
 * Per contracts/inline-extensions.md §1.
 */
export const HighlightInlineSpecExtension =
  InlineSpecExtension<AffineTextAttributes>({
    name: 'highlight',
    schema: z.object({
      highlight: z.string().optional().nullable().catch(undefined),
    }),
    match: delta => {
      return !!delta.attributes?.highlight;
    },
    renderer: ({ delta }) => {
      return html`<affine-text .delta=${delta}></affine-text>`;
    },
  });

/**
 * Obsidian %% comment %% inline spec.
 * Live preview: renders as a zero-width invisible span with aria-hidden="true".
 * Source mode: rendered by a separate source-mode-aware renderer showing %% delimiters.
 * Per contracts/inline-extensions.md §2 and FR-036, FR-051.
 */
export const ObsidianCommentInlineSpecExtension =
  InlineSpecExtension<AffineTextAttributes>({
    name: 'obsidian-comment',
    schema: z.object({
      obsidianComment: z.literal(true).optional().nullable().catch(undefined),
    }),
    match: delta => {
      return !!delta.attributes?.obsidianComment;
    },
    renderer: () => {
      // In live preview: zero-width span, aria-hidden so screen readers skip it.
      return html`<span
        style="display:inline;width:0;overflow:hidden;position:absolute;"
        aria-hidden="true"
      ></span>`;
    },
  });

export const InlineSpecExtensions: ExtensionType[] = [
  BoldInlineSpecExtension,
  ItalicInlineSpecExtension,
  UnderlineInlineSpecExtension,
  StrikeInlineSpecExtension,
  CodeInlineSpecExtension,
  BackgroundInlineSpecExtension,
  ColorInlineSpecExtension,
  HighlightInlineSpecExtension,
  ObsidianCommentInlineSpecExtension,
];
