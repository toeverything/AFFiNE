import { registerGfxWidget } from '../../register-gfx-widget';
import { BoardBlockInteraction } from './board-edgeless-block';
import { EdgelessClipboardBoardConfig } from './edgeless-clipboard-config';
import { BoardBlockHtmlAdapterExtension } from './html-adapter';
import { BoardBlockSchema, BoardBlockSchemaExtension } from './model';
import { BoardSlashMenuConfigExtension } from './slash-menu';

export const boardWidget = registerGfxWidget({
  flavour: BoardBlockSchema.model.flavour,
  schema: BoardBlockSchemaExtension,
  view: {
    page: 'wb-board',
    edgeless: 'wb-board-edgeless',
    preview: 'wb-board-preview',
  },
  slash: BoardSlashMenuConfigExtension,
  clipboard: EdgelessClipboardBoardConfig,
  interaction: BoardBlockInteraction,
  adapter: BoardBlockHtmlAdapterExtension,
  snapshotPainter: props => props.snapshotBlobId as string | undefined,
});

export { BoardBlockSchema, BoardBlockSchemaExtension } from './model';
export { BoardBlockComponent } from './board-block';
export { BoardEdgelessBlockComponent } from './board-edgeless-block';
export { BoardPreviewBlockComponent } from './board-preview-block';
export { columnsForTemplate } from './types';
export { getBoardLodLevel, liveKanbanBudget } from './live-budget';
export { readBoardColumns } from './column-snapshot';
export { sliceCards, windowRange } from './virtualize';
export { readBoardGrid } from './grid';
export {
  moveCardCells,
  readGroupByAxes,
  isWipExceeded,
} from './semantics';
