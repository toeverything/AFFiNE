import type { Node } from '@affine/component';
import type { PageMeta } from '@blocksuite/store';
import type { MouseEvent } from 'react';
import { useMemo } from 'react';

import type { BlockSuiteWorkspace } from '../shared';

export type RenderProps = {
  blockSuiteWorkspace: BlockSuiteWorkspace;
  onClick?: (e: MouseEvent<HTMLDivElement>, node: PinboardNode) => void;
  showOperationButton?: boolean;
  // If true, the node will be rendered with path icon at start
  asPath?: boolean;
};

export type NodeRenderProps = RenderProps & {
  metas: PageMeta[];
  currentMeta: PageMeta;
};

export type PinboardNode = Node<NodeRenderProps>;

function flattenToTree(
  metas: PageMeta[],
  pinboardRender: PinboardNode['render'],
  renderProps: RenderProps
): PinboardNode[] {
  const rootMeta = metas.find(meta => meta.isRootPinboard);
  const helper = (internalMetas: PageMeta[]): PinboardNode[] => {
    return internalMetas.reduce<PinboardNode[]>(
      (returnedMetas, internalMeta) => {
        const { subpageIds = [] } = internalMeta;
        const childrenMetas = subpageIds
          .map(id => metas.find(m => m.id === id)!)
          .filter(m => m);
        // @ts-ignore
        const returnedMeta: PinboardNode = {
          ...internalMeta,
          children: helper(childrenMetas),
          render: (node, props) =>
            pinboardRender(node, props, {
              ...renderProps,
              currentMeta: internalMeta,
              metas,
            }),
        };
        returnedMetas.push(returnedMeta);
        return returnedMetas;
      },
      []
    );
  };
  // Unreachable code, we have removed the root pinboard
  // @ts-expect-error
  return helper(rootMeta ? [{ ...rootMeta, renderTopLine: false }] : []);
}

export function usePinboardData({
  metas,
  pinboardRender,
  blockSuiteWorkspace,
  onClick,
  showOperationButton,
  asPath,
}: {
  metas: PageMeta[];
  pinboardRender: PinboardNode['render'];
} & RenderProps) {
  const data = useMemo(
    () =>
      flattenToTree(metas, pinboardRender, {
        blockSuiteWorkspace,
        onClick,
        showOperationButton,
        asPath,
      }),
    [
      asPath,
      blockSuiteWorkspace,
      metas,
      onClick,
      pinboardRender,
      showOperationButton,
    ]
  );

  return {
    data,
  };
}

export default usePinboardData;
