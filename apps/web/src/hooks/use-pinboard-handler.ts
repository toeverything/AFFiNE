import type { TreeViewProps } from '@affine/component';
import { DebugLogger } from '@affine/debug';
import type { PageMeta } from '@blocksuite/store';
import { nanoid } from '@blocksuite/store';
import { useCallback } from 'react';

import type { BlockSuiteWorkspace } from '../shared';
import { useBlockSuiteWorkspaceHelper } from './use-blocksuite-workspace-helper';
import { usePageMetaHelper } from './use-page-meta';
import type { NodeRenderProps, PinboardNode } from './use-pinboard-data';

const logger = new DebugLogger('pinboard');

function findRootIds(metas: PageMeta[], id: string): string[] {
  const parentMeta = metas.find(m => m.subpageIds?.includes(id));
  if (!parentMeta) {
    return [id];
  }
  return [parentMeta.id, ...findRootIds(metas, parentMeta.id)];
}
export function usePinboardHandler({
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
}) {
  const { createPage } = useBlockSuiteWorkspaceHelper(blockSuiteWorkspace);
  const { getPageMeta, setPageMeta } = usePageMetaHelper(blockSuiteWorkspace);

  const handleAdd = useCallback(
    (node: PinboardNode) => {
      const id = nanoid();
      createPage(id, node.id);
      onAdd?.(id, node.id);
    },
    [createPage, onAdd]
  );

  const handleDelete = useCallback(
    (node: PinboardNode) => {
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
      logger.info('handleDrop', {
        dragId,
        dropId,
        position,
        metas,
      });

      const { topLine, bottomLine } = position;

      const dragParentMeta = metas.find(meta =>
        meta.subpageIds?.includes(dragId)
      );
      if (bottomLine || topLine) {
        const insertOffset = bottomLine ? 1 : 0;

        const dropParentMeta = metas.find(m => m.subpageIds?.includes(dropId));
        if (dropParentMeta?.id === dragParentMeta?.id) {
          // same parent
          const newSubpageIds = [...(dragParentMeta?.subpageIds ?? [])];
          const deleteIndex = newSubpageIds.findIndex(id => id === dragId);
          newSubpageIds.splice(deleteIndex, 1);
          const insertIndex =
            newSubpageIds.findIndex(id => id === dropId) + insertOffset;
          newSubpageIds.splice(insertIndex, 0, dragId);
          dragParentMeta &&
            setPageMeta(dragParentMeta.id, {
              subpageIds: newSubpageIds,
            });
          return onDrop?.(dragId, dropId, position);
        }
        const newDragParentSubpageIds = [...(dragParentMeta?.subpageIds ?? [])];
        const deleteIndex = newDragParentSubpageIds.findIndex(
          id => id === dragId
        );
        newDragParentSubpageIds.splice(deleteIndex, 1);

        const newDropParentSubpageIds = [...(dropParentMeta?.subpageIds ?? [])];
        const insertIndex =
          newDropParentSubpageIds.findIndex(id => id === dropId) + insertOffset;
        newDropParentSubpageIds.splice(insertIndex, 0, dragId);
        dragParentMeta &&
          setPageMeta(dragParentMeta.id, {
            subpageIds: newDragParentSubpageIds,
          });
        dropParentMeta &&
          setPageMeta(dropParentMeta.id, {
            subpageIds: newDropParentSubpageIds,
          });
        return onDrop?.(dragId, dropId, position);
      }

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
    [metas, onDrop, setPageMeta]
  );

  return {
    handleDrop,
    handleAdd,
    handleDelete,
  };
}

export default usePinboardHandler;
