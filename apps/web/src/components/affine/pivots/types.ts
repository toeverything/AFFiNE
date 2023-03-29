import type { Node } from '@affine/component';
import type { PageMeta } from '@blocksuite/store';

export type ExtendRenderProps = {
  // pageMeta: PageMeta;
  openPage: (pageId: string) => void;
  showOperationButton?: boolean;
};
export type TreeNode = Node<PageMeta, ExtendRenderProps>;
