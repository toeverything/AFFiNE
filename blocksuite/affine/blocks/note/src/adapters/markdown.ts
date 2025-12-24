import { NoteBlockSchema, NoteDisplayMode } from '@blocksuite/affine-model';
import {
  BlockMarkdownAdapterExtension,
  type BlockMarkdownAdapterMatcher,
  FOOTNOTE_DEFINITION_PREFIX,
  isFootnoteDefinitionNode,
  type MarkdownAST,
} from '@blocksuite/affine-shared/adapters';
import type { Root } from 'mdast';

const isRootNode = (node: MarkdownAST): node is Root => node.type === 'root';

const createFootnoteDefinition = (
  identifier: string,
  content: string
): MarkdownAST => ({
  type: 'footnoteDefinition',
  label: identifier,
  identifier,
  children: [
    {
      type: 'paragraph',
      children: [
        {
          type: 'text',
          value: content,
        },
      ],
    },
  ],
});

/**
 * Create a markdown adapter matcher for note block.
 *
 * @param displayModeToSkip - The note with specific display mode to skip.
 * For example, the note with display mode `EdgelessOnly` should not be converted to markdown when current editor mode is `Doc`.
 * @returns The markdown adapter matcher.
 */
const createNoteBlockMarkdownAdapterMatcher = (
  displayModeToSkip: NoteDisplayMode
): BlockMarkdownAdapterMatcher => ({
  flavour: NoteBlockSchema.model.flavour,
  toMatch: o => isRootNode(o.node),
  fromMatch: o => o.node.flavour === NoteBlockSchema.model.flavour,
  toBlockSnapshot: {
    enter: (o, context) => {
      if (!isRootNode(o.node)) {
        return;
      }
      const noteAst = o.node;
      // Find all the footnoteDefinition in the noteAst
      const { configs } = context;
      noteAst.children.forEach(child => {
        if (isFootnoteDefinitionNode(child)) {
          const identifier = child.identifier;
          const definitionKey = `${FOOTNOTE_DEFINITION_PREFIX}${identifier}`;
          // Get the text content of the footnoteDefinition
          const textContent = child.children
            .find(child => child.type === 'paragraph')
            ?.children.find(child => child.type === 'text')?.value;
          if (textContent) {
            configs.set(definitionKey, textContent);
          }
        }
      });

      // if there are footnoteDefinition nodes, add a heading node to the noteAst before the first footnoteDefinition node
      const footnoteDefinitionIndex = noteAst.children.findIndex(child =>
        isFootnoteDefinitionNode(child)
      );
      if (footnoteDefinitionIndex !== -1) {
        noteAst.children.splice(footnoteDefinitionIndex, 0, {
          type: 'heading',
          depth: 6,
          data: {
            collapsed: true,
          },
          children: [{ type: 'text', value: 'Sources' }],
        });
      }
    },
  },
  fromBlockSnapshot: {
    enter: (o, context) => {
      const node = o.node;
      if (node.props.displayMode === displayModeToSkip) {
        context.walkerContext.skipAllChildren();
      }
    },
    leave: (_, context) => {
      const { walkerContext, configs } = context;
      // Get all the footnote definitions config starts with FOOTNOTE_DEFINITION_PREFIX
      // And create footnoteDefinition AST node for each of them
      Array.from(configs.keys())
        .filter(key => key.startsWith(FOOTNOTE_DEFINITION_PREFIX))
        .forEach(key => {
          const hasFootnoteDefinition = !!walkerContext.getGlobalContext(key);
          // If the footnoteDefinition node is already in md ast, skip it
          // In markdown file, we only need to create footnoteDefinition once
          if (hasFootnoteDefinition) {
            return;
          }
          const definition = configs.get(key);
          const identifier = key.slice(FOOTNOTE_DEFINITION_PREFIX.length);
          if (definition && identifier) {
            walkerContext
              .openNode(
                createFootnoteDefinition(identifier, definition),
                'children'
              )
              .closeNode();
            // Set the footnoteDefinition node as global context to avoid duplicate creation
            walkerContext.setGlobalContext(key, true);
          }
        });
    },
  },
});

export const docNoteBlockMarkdownAdapterMatcher =
  createNoteBlockMarkdownAdapterMatcher(NoteDisplayMode.EdgelessOnly);

export const edgelessNoteBlockMarkdownAdapterMatcher =
  createNoteBlockMarkdownAdapterMatcher(NoteDisplayMode.DocOnly);

export const DocNoteBlockMarkdownAdapterExtension =
  BlockMarkdownAdapterExtension(docNoteBlockMarkdownAdapterMatcher);

export const EdgelessNoteBlockMarkdownAdapterExtension =
  BlockMarkdownAdapterExtension(edgelessNoteBlockMarkdownAdapterMatcher);
