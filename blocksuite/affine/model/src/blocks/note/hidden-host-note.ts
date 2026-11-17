import type { BlockModel } from '@blocksuite/store';

import { NoteDisplayMode } from '../../consts/note.js';

/**
 * Where a hidden "host" note is placed: an `EdgelessOnly` note that exists
 * only to hold a database shown elsewhere through references (a promoted
 * table, the Journal Todo's table), never shown or picked by itself.
 * Every place that creates one puts it at this position, so it can be
 * recognised even when nothing references it any more.
 */
export const HIDDEN_HOST_NOTE_XYWH = '[-10000, -10000, 800, 480]';

/** A hidden host note (see `HIDDEN_HOST_NOTE_XYWH`). */
export function isHiddenHostNote(model: BlockModel): boolean {
  if (model.flavour !== 'affine:note') return false;
  const props = model.props as { displayMode?: string; xywh?: string };
  return (
    props.displayMode === NoteDisplayMode.EdgelessOnly &&
    props.xywh === HIDDEN_HOST_NOTE_XYWH
  );
}
