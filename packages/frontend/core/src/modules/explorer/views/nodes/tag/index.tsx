import {
  type DropTargetDropEvent,
  type DropTargetOptions,
  toast,
} from '@affine/component';
import type { Tag } from '@affine/core/modules/tag';
import { TagService } from '@affine/core/modules/tag';
import type { AffineDNDData } from '@affine/core/types/dnd';
import { useI18n } from '@affine/i18n';
import { track } from '@affine/track';
import {
  GlobalContextService,
  useLiveData,
  useServices,
} from '@toeverything/infra';
import clsx from 'clsx';
import { useCallback, useMemo } from 'react';

import { EXPLORER_KEY } from '../../../config';
import { ExplorerService } from '../../../services/explorer';
import { ExplorerTreeNode, type ExplorerTreeNodeDropEffect } from '../../tree';
import { ExplorerDocNode } from '../doc';
import type { GenericExplorerNode } from '../types';
import { Empty } from './empty';
import { useExplorerTagNodeOperations } from './operations';
import * as styles from './styles.css';

export const ExplorerTagNode = ({
  tagId,
  onDrop,
  location,
  reorderable,
  operations: additionalOperations,
  dropEffect,
  canDrop,
  defaultRenaming,
  explorerKey,
}: {
  tagId: string;
  defaultRenaming?: boolean;
  explorerKey?: string;
} & GenericExplorerNode) => {
  const t = useI18n();
  const { tagService, globalContextService, explorerService } = useServices({
    TagService,
    GlobalContextService,
    ExplorerService,
  });
  const active =
    useLiveData(globalContextService.globalContext.tagId.$) === tagId;

  const noteExplorer = explorerService.notes;

  const collapsedKey = useMemo(() => {
    return (explorerKey ? explorerKey : EXPLORER_KEY.tags) + ':tag:' + tagId;
  }, [explorerKey, tagId]);

  const collapsed = useLiveData(noteExplorer.collapsed$(collapsedKey));

  const setCollapsed = useCallback(
    (collapsed: boolean) => {
      noteExplorer.setCollapsed(collapsedKey, collapsed);
    },
    [collapsedKey, noteExplorer]
  );

  const tagRecord = useLiveData(tagService.tagList.tagByTagId$(tagId));
  const tagColor = useLiveData(tagRecord?.color$);
  const tagName = useLiveData(tagRecord?.value$);

  const Icon = useCallback(
    ({ className }: { className?: string }) => {
      return (
        <div className={clsx(styles.tagIconContainer, className)}>
          <div
            className={styles.tagIcon}
            style={{
              backgroundColor: tagColor,
            }}
          ></div>
        </div>
      );
    },
    [tagColor]
  );

  const dndData = useMemo(() => {
    return {
      draggable: {
        entity: {
          type: 'tag',
          id: tagId,
        },
        from: location,
      },
      dropTarget: {
        at: 'explorer:tag',
      },
    } satisfies AffineDNDData;
  }, [location, tagId]);

  const handleRename = useCallback(
    (newName: string) => {
      if (tagRecord && tagRecord.value$.value !== newName) {
        tagRecord.rename(newName);
        track.$.navigationPanel.organize.renameOrganizeItem({
          type: 'tag',
        });
      }
    },
    [tagRecord]
  );

  const handleDropOnTag = useCallback(
    (data: DropTargetDropEvent<AffineDNDData>) => {
      if (data.treeInstruction?.type === 'make-child' && tagRecord) {
        if (data.source.data.entity?.type === 'doc') {
          tagRecord.tag(data.source.data.entity.id);
          track.$.navigationPanel.tags.tagDoc({
            control: 'drag',
          });
        } else {
          toast(t['com.affine.rootAppSidebar.tag.doc-only']());
        }
      } else {
        onDrop?.(data);
      }
    },
    [onDrop, t, tagRecord]
  );

  const handleDropEffectOnTag = useCallback<ExplorerTreeNodeDropEffect>(
    data => {
      if (data.treeInstruction?.type === 'make-child') {
        if (data.source.data.entity?.type === 'doc') {
          return 'link';
        }
      } else {
        return dropEffect?.(data);
      }
      return;
    },
    [dropEffect]
  );

  const handleDropOnPlaceholder = useCallback(
    (data: DropTargetDropEvent<AffineDNDData>) => {
      if (tagRecord) {
        if (data.source.data.entity?.type === 'doc') {
          tagRecord.tag(data.source.data.entity.id);
        } else {
          toast(t['com.affine.rootAppSidebar.tag.doc-only']());
        }
      }
    },
    [t, tagRecord]
  );

  const handleCanDrop = useMemo<DropTargetOptions<AffineDNDData>['canDrop']>(
    () => args => {
      const entityType = args.source.data.entity?.type;
      return args.treeInstruction?.type !== 'make-child'
        ? ((typeof canDrop === 'function' ? canDrop(args) : canDrop) ?? true)
        : entityType === 'doc';
    },
    [canDrop]
  );

  const operations = useExplorerTagNodeOperations(
    tagId,
    useMemo(
      () => ({
        openNodeCollapsed: () => setCollapsed(false),
      }),
      [setCollapsed]
    )
  );

  const finalOperations = useMemo(() => {
    if (additionalOperations) {
      return [...operations, ...additionalOperations];
    }
    return operations;
  }, [additionalOperations, operations]);

  if (!tagRecord) {
    return null;
  }

  return (
    <ExplorerTreeNode
      icon={Icon}
      name={tagName || t['Untitled']()}
      dndData={dndData}
      onDrop={handleDropOnTag}
      renameable
      collapsed={collapsed}
      setCollapsed={setCollapsed}
      to={`/tag/${tagId}`}
      active={active}
      defaultRenaming={defaultRenaming}
      reorderable={reorderable}
      onRename={handleRename}
      canDrop={handleCanDrop}
      childrenPlaceholder={<Empty onDrop={handleDropOnPlaceholder} />}
      operations={finalOperations}
      dropEffect={handleDropEffectOnTag}
      data-testid={`explorer-tag-${tagId}`}
    >
      <ExplorerTagNodeDocs tag={tagRecord} explorerKey={collapsedKey} />
    </ExplorerTreeNode>
  );
};

/**
 * the `tag.pageIds$` has a performance issue,
 * so we split the tag node children into a separate component,
 * so it won't be rendered when the tag node is collapsed.
 */
export const ExplorerTagNodeDocs = ({
  tag,
  explorerKey,
}: {
  tag: Tag;
  explorerKey: string;
}) => {
  const tagDocIds = useLiveData(tag.pageIds$);

  return tagDocIds.map(docId => (
    <ExplorerDocNode
      key={docId}
      docId={docId}
      reorderable={false}
      explorerKey={explorerKey}
      location={{
        at: 'explorer:tags:docs',
      }}
    />
  ));
};
