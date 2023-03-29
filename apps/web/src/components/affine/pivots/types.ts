import type { Node } from '@affine/component';
import type { PageMeta } from '@blocksuite/store';
import type { MouseEvent } from 'react';

export type RenderProps = {
  onClick?: (e: MouseEvent<HTMLDivElement>, node: TreeNode) => void;
  showOperationButton?: boolean;
  allMetas: PageMeta[];
};

export type InternalRenderProps = RenderProps & { pageMeta: PageMeta };

export type TreeNode = Node<InternalRenderProps>;
