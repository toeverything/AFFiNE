import type { Node } from '@affine/component';
import type { PageMeta } from '@blocksuite/store';
import type { MouseEvent } from 'react';

import type { BlockSuiteWorkspace } from '../../../shared';

export type RenderProps = {
  blockSuiteWorkspace: BlockSuiteWorkspace;
  onClick?: (e: MouseEvent<HTMLDivElement>, node: TreeNode) => void;
  showOperationButton?: boolean;
};

export type NodeRenderProps = RenderProps & {
  metas: PageMeta[];
  currentMeta: PageMeta;
};

export type TreeNode = Node<NodeRenderProps>;
