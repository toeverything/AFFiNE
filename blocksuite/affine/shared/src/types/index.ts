import type { FootNote, ReferenceInfo } from '@blocksuite/affine-model';
import type { InlineEditor } from '@blocksuite/std/inline';
import type { BlockModel } from '@blocksuite/store';
export * from './uni-component';

export type NoteChildrenFlavour =
  | 'affine:paragraph'
  | 'affine:list'
  | 'affine:code'
  | 'affine:divider'
  | 'affine:database'
  | 'affine:data-view'
  | 'affine:image'
  | 'affine:bookmark'
  | 'affine:attachment'
  | 'affine:surface-ref';

export interface Viewport {
  left: number;
  top: number;
  scrollLeft: number;
  scrollTop: number;
  scrollWidth: number;
  scrollHeight: number;
  clientWidth: number;
  clientHeight: number;
}

export type ExtendedModel = BlockModel & Record<string, any>;

export type IndentContext = {
  blockId: string;
  inlineIndex: number;
  flavour: string;
  type: 'indent' | 'dedent';
};

export type AffineTextStyleAttributes = {
  bold?: true | null;
  italic?: true | null;
  underline?: true | null;
  strike?: true | null;
  code?: true | null;
  color?: string | null;
  background?: string | null;
};

export type AffineTextAttributes = AffineTextStyleAttributes & {
  link?: string | null;
  reference?:
    | ({
        type: 'Subpage' | 'LinkedPage';
      } & ReferenceInfo)
    | null;
  latex?: string | null;
  footnote?: FootNote | null;
  mention?: {
    member: string;
    notification?: string;
  } | null;
  /**
   * Obsidian ==highlight== attribute.
   * Value is a CSS colour value or design token (e.g. 'var(--affine-highlight-yellow)').
   * null | undefined = not highlighted.
   * CRDT merge: last-write-wins, same as `color` and `background`.
   */
  highlight?: string | null;
  /**
   * Obsidian %% comment %% attribute.
   * true = hidden in live preview, visible with delimiters in source mode.
   * null | undefined = normal visible text.
   * CRDT merge: last-write-wins, same as `bold` and `italic`.
   */
  obsidianComment?: true | null;
  /**
   * Obsidian-style inline tag (#tag-name).
   * name is canonical lowercase tag name without the # prefix.
   */
  tag?: { name: string } | null;
  [key: `comment-${string}`]: boolean | null;
};

export type AffineInlineEditor = InlineEditor<AffineTextAttributes>;

export type SelectedRect = {
  left: number;
  top: number;
  width: number;
  height: number;
  borderWidth: number;
  borderStyle: string;
  rotate: number;
};
