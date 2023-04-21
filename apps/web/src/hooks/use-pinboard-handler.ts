import type { TreeViewProps } from '@affine/component';
import { DebugLogger } from '@affine/debug';
import type { PageMeta } from '@blocksuite/store';
import { nanoid } from '@blocksuite/store';
import { usePageMetaHelper } from '@toeverything/hooks/use-block-suite-page-meta';
import { useBlockSuiteWorkspaceHelper } from '@toeverything/hooks/use-block-suite-workspace-helper';
import { useCallback } from 'react';

import type { BlockSuiteWorkspace } from '../shared';
import { useBlockSuiteMetaHelper } from './affine/use-block-suite-meta-helper';
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
  const { setPageMeta } = usePageMetaHelper(blockSuiteWorkspace);
  const { removeToTrash: removeToTrashHelper } =
    useBlockSuiteMetaHelper(blockSuiteWorkspace);
  // Just need handle add operation, delete check is handled in blockSuite's reference link
  const addReferenceLink = useCallback(
    (pageId: string, referenceId: string) => {
      const page = blockSuiteWorkspace?.getPage(pageId);
      if (!page) {
        return;
      }
      const text = page.Text.fromDelta([
        {
          insert: ' ',
          attributes: {
            reference: {
              type: 'Subpage',
              pageId: referenceId,
            },
          },
        },
      ]);
      const [frame] = page.getBlockByFlavour('affine:frame');

      frame && page.addBlock('affine:paragraph', { text }, frame.id);
    },
    [blockSuiteWorkspace]
  );

  const addPin = useCallback(
    (parentId: string) => {
      const id = nanoid();
      createPage(id, parentId);
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
        dropParentMeta && addReferenceLink(dropParentMeta.id, dragId);
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
      addReferenceLink(dropMeta.id, dragId);
    },
    [addReferenceLink, metas, onDrop, setPageMeta]
  );

  return {
    dropPin,
    addPin,
    deletePin,
  };
}

export default usePinboardHandler;
