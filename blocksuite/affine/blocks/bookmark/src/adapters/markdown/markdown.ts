import { createEmbedBlockMarkdownAdapterMatcher } from '@blocksuite/affine-block-embed';
import {
  BookmarkBlockSchema,
  FootNoteReferenceParamsSchema,
} from '@blocksuite/affine-model';
import {
  BlockMarkdownAdapterExtension,
  FOOTNOTE_DEFINITION_PREFIX,
  getFootnoteDefinitionText,
  isFootnoteDefinitionNode,
  type MarkdownAST,
} from '@blocksuite/affine-shared/adapters';
import { nanoid } from '@blocksuite/store';

const isUrlFootnoteDefinitionNode = (node: MarkdownAST) => {
  if (!isFootnoteDefinitionNode(node)) return false;
  const footnoteDefinition = getFootnoteDefinitionText(node);
  try {
    const footnoteDefinitionJson = FootNoteReferenceParamsSchema.parse(
      JSON.parse(footnoteDefinition)
    );
    return (
      footnoteDefinitionJson.type === 'url' && !!footnoteDefinitionJson.url
    );
  } catch {
    return false;
  }
};

export const bookmarkBlockMarkdownAdapterMatcher =
  createEmbedBlockMarkdownAdapterMatcher(BookmarkBlockSchema.model.flavour, {
    toMatch: o => isUrlFootnoteDefinitionNode(o.node),
    toBlockSnapshot: {
      enter: (o, context) => {
        if (!isFootnoteDefinitionNode(o.node)) {
          return;
        }

        const { walkerContext, configs } = context;
        const footnoteIdentifier = o.node.identifier;
        const footnoteDefinitionKey = `${FOOTNOTE_DEFINITION_PREFIX}${footnoteIdentifier}`;
        const footnoteDefinition = configs.get(footnoteDefinitionKey);
        if (!footnoteDefinition) {
          return;
        }
        let footnoteDefinitionJson;
        try {
          footnoteDefinitionJson = FootNoteReferenceParamsSchema.parse(
            JSON.parse(footnoteDefinition)
          );
          // If the footnote definition contains url, decode it
          if (footnoteDefinitionJson.url) {
            footnoteDefinitionJson.url = decodeURIComponent(
              footnoteDefinitionJson.url
            );
          }
          if (footnoteDefinitionJson.favicon) {
            footnoteDefinitionJson.favicon = decodeURIComponent(
              footnoteDefinitionJson.favicon
            );
          }
        } catch (err) {
          console.warn('Failed to parse or decode footnote definition:', err);
          return;
        }

        const { url, favicon, title, description } = footnoteDefinitionJson;
        walkerContext
          .openNode(
            {
              type: 'block',
              id: nanoid(),
              flavour: BookmarkBlockSchema.model.flavour,
              props: {
                url,
                footnoteIdentifier,
                icon: favicon,
                title,
                description,
                style: 'citation',
              },
              children: [],
            },
            'children'
          )
          .closeNode();
        walkerContext.skipAllChildren();
      },
    },
  });

export const BookmarkBlockMarkdownAdapterExtension =
  BlockMarkdownAdapterExtension(bookmarkBlockMarkdownAdapterMatcher);
