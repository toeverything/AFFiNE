import { BlockViewExtension, FlavourExtension } from '@blocksuite/block-std';
import type { ExtensionType } from '@blocksuite/store';
import { literal } from 'lit/static-html.js';

import { ParagraphBlockAdapterExtensions } from './adapters/extension.js';
import { ParagraphBlockConfigExtension } from './paragraph-block-config.js';
import {
  ParagraphKeymapExtension,
  ParagraphTextKeymapExtension,
} from './paragraph-keymap.js';

const placeholders = {
  text: "Type '/' for commands",
  h1: 'Heading 1',
  h2: 'Heading 2',
  h3: 'Heading 3',
  h4: 'Heading 4',
  h5: 'Heading 5',
  h6: 'Heading 6',
  quote: '',
};

export const ParagraphBlockSpec: ExtensionType[] = [
  FlavourExtension('affine:paragraph'),
  BlockViewExtension('affine:paragraph', literal`affine-paragraph`),
  ParagraphTextKeymapExtension,
  ParagraphKeymapExtension,
  ParagraphBlockAdapterExtensions,
  ParagraphBlockConfigExtension({
    getPlaceholder: model => {
      return placeholders[model.props.type];
    },
  }),
].flat();
