import type { TreeViewProps } from '@affine/component';
import { DebugLogger } from '@affine/debug';
import type { PageMeta } from '@blocksuite/store';
import { nanoid } from '@blocksuite/store';
import { useCallback } from 'react';

import { useBlockSuiteWorkspaceHelper } from '../../../../hooks/use-blocksuite-workspace-helper';
import { usePageMetaHelper } from '../../../../hooks/use-page-meta';
import type { BlockSuiteWorkspace } from '../../../../shared';
import type { NodeRenderProps, TreeNode } from '../types';

const logger = new DebugLogger('pivot');

const findRootIds = (metas: PageMeta[], id: string): string[] => {
  const parentMeta = metas.find(m => m.subpageIds?.includes(id));
  if (!parentMeta) {
    return [id];
  }
  return [parentMeta.id, ...findRootIds(metas, parentMeta.id)];
};
export const usePivotHandler = ({
  blockSuiteWorkspace,
  metas,
  onAdd,
  onDelete,
  onDrop,
}: {
  blockSuiteWorkspace: BlockSuiteWorkspace;
  metas: PageMeta[];
  onAdd?: (addedId: string, parentId: string) => void;
  onDelete?: TreeViewProps<NodeRenderProps>['onDelete'];
  onDrop?: TreeViewProps<NodeRenderProps>['onDrop'];
}) => {
  const { createPage } = useBlockSuiteWorkspaceHelper(blockSuiteWorkspace);
  const { getPageMeta, setPageMeta, shiftPageMeta } =
    usePageMetaHelper(blockSuiteWorkspace);

  const handleAdd = useCallback(
    (node: TreeNode) => {
      const id = nanoid();
      createPage(id, node.id);
      onAdd?.(id, node.id);
    },
    [createPage, onAdd]
  );

  const handleDelete = useCallback(
    (node: TreeNode) => {
      const removeToTrash = (currentMeta: PageMeta) => {
        const { subpageIds = [] } = currentMeta;
        setPageMeta(currentMeta.id, {
          trash: true,
          trashDate: +new Date(),
        });
        subpageIds.forEach(id => {
          const subcurrentMeta = getPageMeta(id);
          subcurrentMeta && removeToTrash(subcurrentMeta);
        });
      };
      removeToTrash(metas.find(m => m.id === node.id)!);
      onDelete?.(node);
    },
    [metas, getPageMeta, onDelete, setPageMeta]
  );

  const handleDrop = useCallback(
    (
      dragId: string,
      dropId: string,
      position: {
        topLine: boolean;
        bottomLine: boolean;
        internal: boolean;
      }
    ) => {
      if (dragId === dropId) {
        return;
      }
      const dropRootIds = findRootIds(metas, dropId);
      if (dropRootIds.includes(dragId)) {
        return;
      }

      const { topLine, bottomLine } = position;
      logger.info('handleDrop', {
        dragId,
        dropId,
        bottomLine,
        metas,
      });

      const dragParentMeta = metas.find(meta =>
        meta.subpageIds?.includes(dragId)
      );
      if (bottomLine || topLine) {
        const insertOffset = bottomLine ? 1 : 0;
        const dropParentMeta = metas.find(m => m.subpageIds?.includes(dropId));

        if (!dropParentMeta) {
          // drop into root
          logger.info('drop into root and resort');

          if (dragParentMeta) {
            const newSubpageIds = [...(dragParentMeta.subpageIds ?? [])];

            const deleteIndex = dragParentMeta.subpageIds?.findIndex(
              id => id === dragId
            );
            newSubpageIds.splice(deleteIndex, 1);
            setPageMeta(dragParentMeta.id, {
              subpageIds: newSubpageIds,
            });
          }

          logger.info('resort root meta');
          const insertIndex =
            metas.findIndex(m => m.id === dropId) + insertOffset;
          shiftPageMeta(dragId, insertIndex);
          return onDrop?.(dragId, dropId, position);
        }

        if (
          dragParentMeta &&
          (dragParentMeta.id === dropId ||
            dragParentMeta.id === dropParentMeta!.id)
        ) {
          logger.info('drop to resort');
          // need to resort
          const newSubpageIds = [...(dragParentMeta.subpageIds ?? [])];

          const deleteIndex = newSubpageIds.findIndex(id => id === dragId);
          newSubpageIds.splice(deleteIndex, 1);

          const insertIndex =
            newSubpageIds.findIndex(id => id === dropId) + insertOffset;
          newSubpageIds.splice(insertIndex, 0, dragId);
          setPageMeta(dropParentMeta.id, {
            subpageIds: newSubpageIds,
          });

          return onDrop?.(dragId, dropId, position);
        }

        logger.info('drop into drop node parent and resort');

        if (dragParentMeta) {
          const metaIndex = dragParentMeta.subpageIds.findIndex(
            id => id === dragId
          );
          const newSubpageIds = [...dragParentMeta.subpageIds];
          newSubpageIds.splice(metaIndex, 1);
          setPageMeta(dragParentMeta.id, {
            subpageIds: newSubpageIds,
          });
        }
        const newSubpageIds = [...(dropParentMeta!.subpageIds ?? [])];
        const insertIndex = newSubpageIds.findIndex(id => id === dropId) + 1;
        newSubpageIds.splice(insertIndex, 0, dragId);
        setPageMeta(dropParentMeta.id, {
          subpageIds: newSubpageIds,
        });

        return onDrop?.(dragId, dropId, position);
      }

      logger.info('drop into the drop node');

      // drop into the node
      if (dragParentMeta && dragParentMeta.id === dropId) {
        return;
      }
      if (dragParentMeta) {
        const metaIndex = dragParentMeta.subpageIds.findIndex(
          id => id === dragId
        );
        const newSubpageIds = [...dragParentMeta.subpageIds];
        newSubpageIds.splice(metaIndex, 1);
        setPageMeta(dragParentMeta.id, {
          subpageIds: newSubpageIds,
        });
      }
      const dropMeta = metas.find(meta => meta.id === dropId)!;
      const newSubpageIds = [dragId, ...(dropMeta.subpageIds ?? [])];
      setPageMeta(dropMeta.id, {
        subpageIds: newSubpageIds,
      });
    },
    [metas, onDrop, setPageMeta, shiftPageMeta]
  );

  return {
    handleDrop,
    handleAdd,
    handleDelete,
  };
};

export default usePivotHandler;
