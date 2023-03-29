import type { TreeViewProps } from '@affine/component';
import { DebugLogger } from '@affine/debug';
import type { PageMeta } from '@blocksuite/store';
import { nanoid } from '@blocksuite/store';
import { useCallback } from 'react';

import { useBlockSuiteWorkspaceHelper } from '../../../../hooks/use-blocksuite-workspace-helper';
import { usePageMetaHelper } from '../../../../hooks/use-page-meta';
import type { RemWorkspace } from '../../../../shared';
import type { ExtendRenderProps, TreeNode } from '../types';
const logger = new DebugLogger('pivot');

export const usePivotHandler = ({
  currentWorkspace,
  allMetas,
  onAdd,
  onDelete,
  onDrop,
}: {
  currentWorkspace: RemWorkspace;
  allMetas: PageMeta[];
  onAdd?: TreeViewProps<TreeNode, ExtendRenderProps>['onAdd'];
  onDelete?: TreeViewProps<TreeNode, ExtendRenderProps>['onDelete'];
  onDrop?: TreeViewProps<TreeNode, ExtendRenderProps>['onDrop'];
}) => {
  const { createPage } = useBlockSuiteWorkspaceHelper(
    currentWorkspace.blockSuiteWorkspace
  );
  const { getPageMeta, setPageMeta, shiftPageMeta } = usePageMetaHelper(
    currentWorkspace.blockSuiteWorkspace
  );

  const handleAdd = useCallback(
    (node: TreeNode) => {
      const id = nanoid();
      createPage(id, node.id);
      onAdd?.(node);
    },
    [createPage, onAdd]
  );

  const handleDelete = useCallback(
    (node: TreeNode) => {
      const removeToTrash = (pageMeta: PageMeta) => {
        const { subpageIds = [] } = pageMeta;
        setPageMeta(pageMeta.id, { trash: true, trashDate: +new Date() });
        subpageIds.forEach(id => {
          const subpageMeta = getPageMeta(id);
          subpageMeta && removeToTrash(subpageMeta);
        });
      };
      removeToTrash(node as PageMeta);
      onDelete?.(node);
    },
    [getPageMeta, onDelete, setPageMeta]
  );

  const handleDrop = useCallback(
    (
      dragNode: TreeNode,
      dropNode: TreeNode,
      position: {
        topLine: boolean;
        bottomLine: boolean;
        internal: boolean;
      }
    ) => {
      const { topLine, bottomLine } = position;
      logger.info('handleDrop', { dragNode, dropNode, bottomLine, allMetas });

      const dragParentMeta = allMetas.find(meta =>
        meta.subpageIds?.includes(dragNode.id)
      );
      if (bottomLine || topLine) {
        const insertOffset = bottomLine ? 1 : 0;
        const dropParentMeta = allMetas.find(m =>
          m.subpageIds?.includes(dropNode.id)
        );

        if (!dropParentMeta) {
          // drop into root
          logger.info('drop into root and resort');

          if (dragParentMeta) {
            const newSubpageIds = [...(dragParentMeta.subpageIds ?? [])];

            const deleteIndex = dragParentMeta.subpageIds?.findIndex(
              id => id === dragNode.id
            );
            newSubpageIds.splice(deleteIndex, 1);
            setPageMeta(dragParentMeta.id, {
              subpageIds: newSubpageIds,
            });
          }

          logger.info('resort root meta');
          const insertIndex =
            allMetas.findIndex(m => m.id === dropNode.id) + insertOffset;
          shiftPageMeta(dragNode.id, insertIndex);
          return onDrop?.(dragNode, dropNode, position);
        }

        if (
          dragParentMeta &&
          (dragParentMeta.id === dropNode.id ||
            dragParentMeta.id === dropParentMeta!.id)
        ) {
          logger.info('drop to resort');
          // need to resort
          const newSubpageIds = [...(dragParentMeta.subpageIds ?? [])];

          const deleteIndex = newSubpageIds.findIndex(id => id === dragNode.id);
          newSubpageIds.splice(deleteIndex, 1);

          const insertIndex =
            newSubpageIds.findIndex(id => id === dropNode.id) + insertOffset;
          newSubpageIds.splice(insertIndex, 0, dragNode.id);
          setPageMeta(dropParentMeta.id, {
            subpageIds: newSubpageIds,
          });

          return onDrop?.(dragNode, dropNode, position);
        }

        logger.info('drop into drop node parent and resort');

        if (dragParentMeta) {
          const metaIndex = dragParentMeta.subpageIds.findIndex(
            id => id === dragNode.id
          );
          const newSubpageIds = [...dragParentMeta.subpageIds];
          newSubpageIds.splice(metaIndex, 1);
          setPageMeta(dragParentMeta.id, {
            subpageIds: newSubpageIds,
          });
        }
        const newSubpageIds = [...(dropParentMeta!.subpageIds ?? [])];
        const insertIndex =
          newSubpageIds.findIndex(id => id === dropNode.id) + 1;
        newSubpageIds.splice(insertIndex, 0, dragNode.id);
        setPageMeta(dropParentMeta.id, {
          subpageIds: newSubpageIds,
        });

        return onDrop?.(dragNode, dropNode, position);
      }

      logger.info('drop into the drop node');

      // drop into the node
      if (dragParentMeta && dragParentMeta.id === dropNode.id) {
        return;
      }
      if (dragParentMeta) {
        const metaIndex = dragParentMeta.subpageIds.findIndex(
          id => id === dragNode.id
        );
        const newSubpageIds = [...dragParentMeta.subpageIds];
        newSubpageIds.splice(metaIndex, 1);
        setPageMeta(dragParentMeta.id, {
          subpageIds: newSubpageIds,
        });
      }
      const dropMeta = allMetas.find(meta => meta.id === dropNode.id)!;
      const newSubpageIds = [dragNode.id, ...(dropMeta.subpageIds ?? [])];
      setPageMeta(dropMeta.id, {
        subpageIds: newSubpageIds,
      });
    },
    [allMetas, onDrop, setPageMeta, shiftPageMeta]
  );

  return {
    handleDrop,
    handleAdd,
    handleDelete,
  };
};

export default usePivotHandler;
