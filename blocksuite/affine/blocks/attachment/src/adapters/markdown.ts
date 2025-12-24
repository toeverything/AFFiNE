import {
  AttachmentBlockSchema,
  FootNoteReferenceParamsSchema,
} from '@blocksuite/affine-model';
import {
  BlockMarkdownAdapterExtension,
  type BlockMarkdownAdapterMatcher,
  FOOTNOTE_DEFINITION_PREFIX,
  getFootnoteDefinitionText,
  isFootnoteDefinitionNode,
  type MarkdownAST,
} from '@blocksuite/affine-shared/adapters';
import { nanoid } from '@blocksuite/store';

const isAttachmentFootnoteDefinitionNode = (node: MarkdownAST) => {
  if (!isFootnoteDefinitionNode(node)) return false;
  const footnoteDefinition = getFootnoteDefinitionText(node);
  try {
    const footnoteDefinitionJson = FootNoteReferenceParamsSchema.parse(
      JSON.parse(footnoteDefinition)
    );
    return (
      footnoteDefinitionJson.type === 'attachment' &&
      !!footnoteDefinitionJson.blobId
    );
  } catch {
    return false;
  }
};

export const attachmentBlockMarkdownAdapterMatcher: BlockMarkdownAdapterMatcher =
  {
    flavour: AttachmentBlockSchema.model.flavour,
    toMatch: o => isAttachmentFootnoteDefinitionNode(o.node),
    fromMatch: o => o.node.flavour === AttachmentBlockSchema.model.flavour,
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
        try {
          const footnoteDefinitionJson = FootNoteReferenceParamsSchema.parse(
            JSON.parse(footnoteDefinition)
          );
          const { blobId, fileName } = footnoteDefinitionJson;
          if (!blobId || !fileName) {
            return;
          }
          walkerContext
            .openNode(
              {
                type: 'block',
                id: nanoid(),
                flavour: AttachmentBlockSchema.model.flavour,
                props: {
                  name: fileName,
                  sourceId: blobId,
                  footnoteIdentifier,
                  style: 'citation',
                },
                children: [],
              },
              'children'
            )
            .closeNode();
          walkerContext.skipAllChildren();
        } catch (err) {
          console.warn('Failed to parse attachment footnote definition:', err);
          return;
        }
      },
    },
    fromBlockSnapshot: {},
  };

export const AttachmentBlockMarkdownAdapterExtension =
  BlockMarkdownAdapterExtension(attachmentBlockMarkdownAdapterMatcher);
