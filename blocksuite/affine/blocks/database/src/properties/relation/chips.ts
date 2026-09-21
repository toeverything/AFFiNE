import type { DatabaseBlockModel } from '@blocksuite/affine-model';
import type { BlockModel } from '@blocksuite/store';
import { html, type TemplateResult } from 'lit';

import { getIcon } from '../../block-icons.js';
import { getRowIcon } from '../icon/read.js';
import { renderIconValue } from '../icon/render.js';
import {
  relationChipIconStyle,
  relationChipStyle,
  relationChipTitleStyle,
} from './cell-renderer-css.js';

export type RelationRow = {
  id: string;
  title: string;
  icon: TemplateResult | string;
};

/**
 * One linked row, as a chip needs it. The icon is the row's own when its
 * database carries an icon column -- the way a page icon follows a page
 * wherever it is mentioned -- and the block-type glyph otherwise.
 */
export const toRelationRow = (
  db: DatabaseBlockModel,
  model: BlockModel
): RelationRow => {
  const own = getRowIcon(db, model.id);
  const rendered = renderIconValue(own);
  return {
    id: model.id,
    // `deltas$` is a signal, so a title edited in the target database
    // re-renders this chip without any wiring of our own.
    title:
      model.text?.deltas$.value
        .map(delta => delta.insert)
        .join('')
        .trim() ?? '',
    icon: rendered ?? getIcon(model as Parameters<typeof getIcon>[0]),
  };
};

export const renderRelationChip = (row: RelationRow) => html`<span
  class="${relationChipStyle}"
>
  <span class="${relationChipIconStyle}">${row.icon}</span>
  <span class="${relationChipTitleStyle}">${row.title || 'Untitled'}</span>
</span>`;
