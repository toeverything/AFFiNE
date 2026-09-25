import type { DatabaseBlockModel } from '@blocksuite/affine-model';

import { getCell } from '../../utils/block-utils.js';
import type { IconValue } from './define.js';

/**
 * The property type string. Kept beside the reader rather than imported from
 * `define.ts`, so code that only needs to *find* the icon column does not pull
 * in the renderer and its lit dependencies.
 */
export const ICON_TYPE = 'icon';

export const findIconProperty = (db: DatabaseBlockModel) =>
  db.props.columns$.value.find(c => c.type === ICON_TYPE);

/**
 * A row's own icon, or null when the table has no icon column or this row has
 * not been given one. Callers fall back to the block's glyph.
 */
export const getRowIcon = (db: DatabaseBlockModel, rowId: string): IconValue => {
  const iconColumn = findIconProperty(db);
  if (!iconColumn) return null;
  const value = getCell(db, rowId, iconColumn.id)?.value;
  return value && typeof value === 'object' ? (value as IconValue) : null;
};
