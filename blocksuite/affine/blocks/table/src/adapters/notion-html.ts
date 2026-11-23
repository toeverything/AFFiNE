import { TableBlockSchema } from '@blocksuite/affine-model';
import {
  BlockNotionHtmlAdapterExtension,
  type BlockNotionHtmlAdapterMatcher,
  HastUtils,
} from '@blocksuite/affine-shared/adapters';

const TABLE_NODE_TYPES = new Set(['table', 'th', 'tr']);

export const tableBlockNotionHtmlAdapterMatcher: BlockNotionHtmlAdapterMatcher =
  {
    flavour: TableBlockSchema.model.flavour,
    toMatch: o =>
      HastUtils.isElement(o.node) && TABLE_NODE_TYPES.has(o.node.tagName),
    fromMatch: () => false,
    toBlockSnapshot: {},
    fromBlockSnapshot: {},
  };

export const TableBlockNotionHtmlAdapterExtension =
  BlockNotionHtmlAdapterExtension(tableBlockNotionHtmlAdapterMatcher);
