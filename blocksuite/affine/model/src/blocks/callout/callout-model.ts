import type { IconData } from '@blocksuite/affine-shared/services';
import {
  BlockModel,
  BlockSchemaExtension,
  defineBlockSchema,
  type Text,
} from '@blocksuite/store';

import type { BlockMeta } from '../../utils/types';

/**
 * Obsidian callout type identifiers.
 * Canonical aliases per data-model.md §3.
 * Renderer applies preset icon/colour via getCalloutTypeConfig().
 * null | undefined = legacy callout; renderer uses "note" defaults (backwards-compatible).
 */
export type CalloutType =
  | 'note'
  | 'info'
  | 'todo'
  | 'tip'
  | 'hint'
  | 'important'
  | 'success'
  | 'check'
  | 'done'
  | 'question'
  | 'help'
  | 'faq'
  | 'warning'
  | 'caution'
  | 'attention'
  | 'failure'
  | 'fail'
  | 'missing'
  | 'danger'
  | 'error'
  | 'bug'
  | 'example'
  | 'quote'
  | 'cite'
  | 'abstract'
  | 'summary'
  | 'tldr';

export type CalloutProps = {
  icon?: IconData;
  text: Text;
  backgroundColorName?: string;
  /**
   * Obsidian callout type (e.g. 'warning', 'tip').
   * null | undefined = legacy callout, renders with "note" defaults.
   * CRDT merge: last-write-wins (LWW-register).
   */
  calloutType?: CalloutType | null;
  /**
   * Whether the callout has a fold/expand toggle.
   * false | undefined = not foldable (default, preserves existing appearance).
   */
  foldable?: boolean;
  /**
   * Whether the callout is currently folded (collapsed).
   * false | undefined = expanded (default).
   * CRDT merge: last-write-wins (LWW-register).
   */
  folded?: boolean;
} & BlockMeta;

export const CalloutBlockSchema = defineBlockSchema({
  flavour: 'affine:callout',
  props: (internal): CalloutProps => ({
    icon: { type: 'emoji', unicode: '💡' } as IconData,
    text: internal.Text(),
    backgroundColorName: 'grey',
    calloutType: undefined,
    foldable: undefined,
    folded: undefined,
    'meta:createdAt': undefined,
    'meta:updatedAt': undefined,
    'meta:createdBy': undefined,
    'meta:updatedBy': undefined,
  }),
  metadata: {
    version: 1,
    role: 'hub',
    parent: [
      'affine:note',
      'affine:database',
      'affine:paragraph',
      'affine:list',
      'affine:edgeless-text',
      'affine:transcription',
    ],
    children: ['affine:paragraph', 'affine:list'],
  },
  toModel: () => new CalloutBlockModel(),
});

export class CalloutBlockModel extends BlockModel<CalloutProps> {}

export const CalloutBlockSchemaExtension =
  BlockSchemaExtension(CalloutBlockSchema);
