import type { TreeViewProps } from '@affine/component';
import { DebugLogger } from '@affine/debug';
import type { PageMeta } from '@blocksuite/store';
import { nanoid } from '@blocksuite/store';
import { usePageMetaHelper } from '@toeverything/hooks/use-block-suite-page-meta';
import { useBlockSuiteWorkspaceHelper } from '@toeverything/hooks/use-block-suite-workspace-helper';
import { useCallback, useMemo } from 'react';

import type { BlockSuiteWorkspace } from '../shared';
import { useBlockSuiteMetaHelper } from './affine/use-block-suite-meta-helper';
import { useReferenceLinkHelper } from './affine/use-reference-link-helper';
import type { NodeRenderProps } from './use-pinboard-data';

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
  metas: propsMetas,
  onAdd,
  onDelete,
  onDrop,
}: {
  blockSuiteWorkspace: BlockSuiteWorkspace;
  metas?: PageMeta[];
  onAdd?: (addedId: string, parentId: string) => void;
  onDelete?: TreeViewProps<NodeRenderProps>['onDelete'];
  onDrop?: TreeViewProps<NodeRenderProps>['onDrop'];
}) {
  const metas = useMemo(
    () => propsMetas || blockSuiteWorkspace.meta.pageMetas || [],
    [blockSuiteWorkspace.meta.pageMetas, propsMetas]
  );
  const { createPage } = useBlockSuiteWorkspaceHelper(blockSuiteWorkspace);
  const { setPageMeta } = usePageMetaHelper(blockSuiteWorkspace);
  const { removeToTrash: removeToTrashHelper } =
    useBlockSuiteMetaHelper(blockSuiteWorkspace);
  const { addReferenceLink, removeReferenceLink } =
    useReferenceLinkHelper(blockSuiteWorkspace);

  const addPin = useCallback(
    (parentId: string) => {
      const id = nanoid();
      createPage(id);
      onAdd?.(id, parentId);
      addReferenceLink(parentId, id);
    },
    [addReferenceLink, createPage, onAdd]
  );

  const deletePin = useCallback(
    (deleteId: string) => {
      removeToTrashHelper(deleteId);
      onDelete?.(deleteId);
    },
    [removeToTrashHelper, onDelete]
  );

  const dropPin = useCallback(
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
          // same parent, resort node
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
        // Old parent will delete drag node, new parent will be added
        removeReferenceLink(dragId);
        dropParentMeta && addReferenceLink(dropParentMeta.id, dragId);
        return onDrop?.(dragId, dropId, position);
      }

      // drop into the node
      if (dragParentMeta && dragParentMeta.id === dropId) {
        return;
      }
      if (dragParentMeta) {
        removeReferenceLink(dragId);
      }
      const dropMeta = metas.find(meta => meta.id === dropId)!;
      addReferenceLink(dropMeta.id, dragId);
    },
    [addReferenceLink, metas, onDrop, removeReferenceLink, setPageMeta]
  );

  return {
    dropPin,
    addPin,
    deletePin,
  };
}

export default usePinboardHandler;
