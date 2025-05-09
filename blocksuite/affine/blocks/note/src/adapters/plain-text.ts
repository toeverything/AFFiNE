import { NoteBlockSchema, NoteDisplayMode } from '@blocksuite/affine-model';
import {
  BlockPlainTextAdapterExtension,
  type BlockPlainTextAdapterMatcher,
} from '@blocksuite/affine-shared/adapters';

/**
 * Create a plain text adapter matcher for note block.
 *
 * @param displayModeToSkip - The note with specific display mode to skip.
 * For example, the note with display mode `EdgelessOnly` should not be converted to plain text when current editor mode is `Doc(Page)`.
 * @returns The plain text adapter matcher.
 */
const createNoteBlockPlainTextAdapterMatcher = (
  displayModeToSkip: NoteDisplayMode
): BlockPlainTextAdapterMatcher => ({
  flavour: NoteBlockSchema.model.flavour,
  toMatch: () => false,
  fromMatch: o => o.node.flavour === NoteBlockSchema.model.flavour,
  toBlockSnapshot: {},
  fromBlockSnapshot: {
    enter: (o, context) => {
      const node = o.node;
      if (node.props.displayMode === displayModeToSkip) {
        context.walkerContext.skipAllChildren();
      }
    },
  },
});

export const docNoteBlockPlainTextAdapterMatcher =
  createNoteBlockPlainTextAdapterMatcher(NoteDisplayMode.EdgelessOnly);

export const edgelessNoteBlockPlainTextAdapterMatcher =
  createNoteBlockPlainTextAdapterMatcher(NoteDisplayMode.DocOnly);

export const DocNoteBlockPlainTextAdapterExtension =
  BlockPlainTextAdapterExtension(docNoteBlockPlainTextAdapterMatcher);

export const EdgelessNoteBlockPlainTextAdapterExtension =
  BlockPlainTextAdapterExtension(edgelessNoteBlockPlainTextAdapterMatcher);
