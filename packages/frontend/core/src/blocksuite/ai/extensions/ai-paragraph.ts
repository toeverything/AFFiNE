import {
  ParagraphBlockConfigExtension,
  ParagraphBlockSpec,
} from '@blocksuite/affine/blocks/paragraph';
import type { ExtensionType } from '@blocksuite/affine/store';

export const AIParagraphBlockSpec: ExtensionType[] = [
  ...ParagraphBlockSpec,
  ParagraphBlockConfigExtension({
    getPlaceholder: model => {
      const placeholders = {
        text: "Type '/' for commands, 'space' for AI",
        h1: 'Heading 1',
        h2: 'Heading 2',
        h3: 'Heading 3',
        h4: 'Heading 4',
        h5: 'Heading 5',
        h6: 'Heading 6',
        quote: '',
      };
      return placeholders[model.props.type];
    },
  }),
];
