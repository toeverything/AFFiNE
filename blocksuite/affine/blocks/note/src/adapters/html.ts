import { NoteBlockSchema, NoteDisplayMode } from '@blocksuite/affine-model';
import {
  BlockHtmlAdapterExtension,
  type BlockHtmlAdapterMatcher,
} from '@blocksuite/affine-shared/adapters';

/**
 * Create a html adapter matcher for note block.
 *
 * @param displayModeToSkip - The note with specific display mode to skip.
 * For example, the note with display mode `EdgelessOnly` should not be converted to html when current editor mode is `Doc(Page)`.
 * @returns The html adapter matcher.
 */
const createNoteBlockHtmlAdapterMatcher = (
  displayModeToSkip: NoteDisplayMode
): BlockHtmlAdapterMatcher => ({
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

export const docNoteBlockHtmlAdapterMatcher = createNoteBlockHtmlAdapterMatcher(
  NoteDisplayMode.EdgelessOnly
);

export const edgelessNoteBlockHtmlAdapterMatcher =
  createNoteBlockHtmlAdapterMatcher(NoteDisplayMode.DocOnly);

export const DocNoteBlockHtmlAdapterExtension = BlockHtmlAdapterExtension(
  docNoteBlockHtmlAdapterMatcher
);

export const EdgelessNoteBlockHtmlAdapterExtension = BlockHtmlAdapterExtension(
  edgelessNoteBlockHtmlAdapterMatcher
);
