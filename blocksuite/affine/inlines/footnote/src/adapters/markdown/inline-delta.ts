import {
  FOOTNOTE_DEFINITION_PREFIX,
  InlineDeltaToMarkdownAdapterExtension,
} from '@blocksuite/affine-shared/adapters';
import type { PhrasingContent } from 'mdast';

export const footnoteReferenceDeltaToMarkdownAdapterMatcher =
  InlineDeltaToMarkdownAdapterExtension({
    name: 'footnote-reference',
    match: delta => !!delta.attributes?.footnote,
    toAST: (delta, context) => {
      const mdast: PhrasingContent = {
        type: 'text',
        value: delta.insert,
      };
      const footnote = delta.attributes?.footnote;
      if (!footnote) {
        return mdast;
      }
      const footnoteDefinitionKey = `${FOOTNOTE_DEFINITION_PREFIX}${footnote.label}`;
      const { configs } = context;
      // FootnoteReference should be paired with FootnoteDefinition
      // If the footnoteDefinition is not in the configs, set it to configs
      // We should add the footnoteDefinition markdown ast nodes to tree after all the footnoteReference markdown ast nodes are added
      if (!configs.has(footnoteDefinitionKey)) {
        // clone the footnote reference
        const clonedFootnoteReference = { ...footnote.reference };
        // If the footnote reference contains url, encode it
        if (clonedFootnoteReference.url) {
          clonedFootnoteReference.url = encodeURIComponent(
            clonedFootnoteReference.url
          );
        }
        if (clonedFootnoteReference.favicon) {
          clonedFootnoteReference.favicon = encodeURIComponent(
            clonedFootnoteReference.favicon
          );
        }
        configs.set(
          footnoteDefinitionKey,
          JSON.stringify(clonedFootnoteReference)
        );
      }
      return {
        type: 'footnoteReference',
        label: footnote.label,
        identifier: footnote.label,
      };
    },
  });
