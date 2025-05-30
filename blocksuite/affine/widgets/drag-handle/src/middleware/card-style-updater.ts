import {
  AttachmentBlockModel,
  BookmarkBlockModel,
  EmbedGithubModel,
  EmbedLinkedDocModel,
  NoteBlockModel,
} from '@blocksuite/affine-model';
import { matchModels } from '@blocksuite/affine-shared/utils';
import type { BlockStdScope } from '@blocksuite/std';
import type { TransformerMiddleware } from '@blocksuite/store';

export const cardStyleUpdater =
  (std: BlockStdScope): TransformerMiddleware =>
  ({ slots }) => {
    slots.beforeImport.subscribe(payload => {
      if (payload.type !== 'block' || !payload.parent) return;
      const parentModel = std.store.getModelById(payload.parent);
      if (!matchModels(parentModel, [NoteBlockModel])) return;

      // TODO(@L-Sun): Refactor this after refactor `store.moveBlocks`
      // Currently, drag a block will use store.moveBlocks to update the tree of blocks
      // but the instance of it is not changed.
      // So change the style of snapshot.props in the middleware is not working.
      // Instead, we can change the style of the model instance in the middleware,
      const model = std.store.getModelById(payload.snapshot.id);
      if (!model) return;

      if (model instanceof AttachmentBlockModel) {
        std.store.updateBlock(model, {
          style: 'horizontalThin',
        });
        return;
      }

      if (model instanceof BookmarkBlockModel) {
        std.store.updateBlock(model, {
          style: 'horizontal',
        });
        return;
      }

      if (model instanceof EmbedGithubModel) {
        std.store.updateBlock(model, {
          style: 'horizontal',
        });
        return;
      }

      if (model instanceof EmbedLinkedDocModel) {
        std.store.updateBlock(model, {
          style: 'horizontal',
        });
        return;
      }
    });
  };
