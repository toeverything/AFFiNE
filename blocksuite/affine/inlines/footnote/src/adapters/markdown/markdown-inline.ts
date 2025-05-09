import { FootNoteReferenceParamsSchema } from '@blocksuite/affine-model';
import {
  FOOTNOTE_DEFINITION_PREFIX,
  MarkdownASTToDeltaExtension,
} from '@blocksuite/affine-shared/adapters';

export const markdownFootnoteReferenceToDeltaMatcher =
  MarkdownASTToDeltaExtension({
    name: 'footnote-reference',
    match: ast => ast.type === 'footnoteReference',
    toDelta: (ast, context) => {
      if (ast.type !== 'footnoteReference') {
        return [];
      }
      try {
        const { configs } = context;
        const footnoteDefinitionKey = `${FOOTNOTE_DEFINITION_PREFIX}${ast.identifier}`;
        const footnoteDefinition = configs.get(footnoteDefinitionKey);
        if (!footnoteDefinition) {
          return [];
        }
        const footnoteDefinitionJson = JSON.parse(footnoteDefinition);
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
        const footnoteReference = FootNoteReferenceParamsSchema.parse(
          footnoteDefinitionJson
        );

        // If the footnote reference is an attachment, and the file type is not set,
        // Try to infer the file type from the file name.
        const { type: referenceType, fileName, fileType } = footnoteReference;
        if (referenceType === 'attachment' && fileName && !fileType) {
          const ext = fileName.split('.').pop()?.toLowerCase();
          if (ext) {
            footnoteReference.fileType = ext;
          }
        }

        const footnote = {
          label: ast.identifier,
          reference: footnoteReference,
        };
        return [{ insert: ' ', attributes: { footnote } }];
      } catch {
        return [];
      }
    },
  });
