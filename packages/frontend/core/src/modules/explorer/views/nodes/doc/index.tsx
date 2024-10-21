import {
  type DropTargetDropEvent,
  type DropTargetOptions,
  Loading,
  toast,
  Tooltip,
} from '@affine/component';
import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import { DocDisplayMetaService } from '@affine/core/modules/doc-display-meta';
import { DocInfoService } from '@affine/core/modules/doc-info';
import { DocsSearchService } from '@affine/core/modules/docs-search';
import type { AffineDNDData } from '@affine/core/types/dnd';
import { useI18n } from '@affine/i18n';
import { track } from '@affine/track';
import {
  DocsService,
  FeatureFlagService,
  GlobalContextService,
  LiveData,
  useLiveData,
  useService,
  useServices,
} from '@toeverything/infra';
import { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { NEVER } from 'rxjs';

import { ExplorerService } from '../../../services/explorer';
import { ExplorerTreeNode, type ExplorerTreeNodeDropEffect } from '../../tree';
import type { GenericExplorerNode } from '../types';
import { Empty } from './empty';
import { useExplorerDocNodeOperations } from './operations';
import * as styles from './styles.css';

export const ExplorerDocNode = ({
  docId,
  onDrop,
  location,
  reorderable,
  isLinked,
  canDrop,
  operations: additionalOperations,
  dropEffect,
  explorerKey,
}: {
  docId: string;
  isLinked?: boolean;
  explorerKey: string;
} & GenericExplorerNode) => {
  const t = useI18n();
  const {
    docsSearchService,
    docsService,
    globalContextService,
    docDisplayMetaService,
    featureFlagService,
    explorerService,
  } = useServices({
    DocsSearchService,
    DocsService,
    GlobalContextService,
    DocDisplayMetaService,
    FeatureFlagService,
    ExplorerService,
  });

  const active =
    useLiveData(globalContextService.globalContext.docId.$) === docId;

  const noteExplorer = explorerService.notes;

  const collapsedKey = useMemo(() => {
    return explorerKey + ':doc:' + docId;
  }, [docId, explorerKey]);

  const collapsed = useLiveData(noteExplorer.collapsed$(collapsedKey));

  const setCollapsed = useCallback(
    (collapsed: boolean) => {
      noteExplorer.setCollapsed(collapsedKey, collapsed);
    },
    [collapsedKey, noteExplorer]
  );

  const docRecord = useLiveData(docsService.list.doc$(docId));
  const DocIcon = useLiveData(
    docDisplayMetaService.icon$(docId, {
      reference: isLinked,
    })
  );
  const docTitle = useLiveData(docDisplayMetaService.title$(docId));
  const isInTrash = useLiveData(docRecord?.trash$);
  const enableEmojiIcon = useLiveData(
    featureFlagService.flags.enable_emoji_doc_icon.$
  );

  const Icon = useCallback(
    ({ className }: { className?: string }) => {
      return <DocIcon className={className} />;
    },
    [DocIcon]
  );

  const children = useLiveData(
    useMemo(
      () =>
        LiveData.from(
          !collapsed ? docsSearchService.watchRefsFrom(docId) : NEVER,
          null
        ),
      [docsSearchService, docId, collapsed]
    )
  );
  const searching = children === null;

  const indexerLoading = useLiveData(
    docsSearchService.indexer.status$.map(
      v => v.remaining === undefined || v.remaining > 0
    )
  );
  const [referencesLoading, setReferencesLoading] = useState(true);
  useLayoutEffect(() => {
    setReferencesLoading(
      prev =>
        prev &&
        indexerLoading /* after loading becomes false, it never becomes true */
    );
  }, [indexerLoading]);

  const dndData = useMemo(() => {
    return {
      draggable: {
        entity: {
          type: 'doc',
          id: docId,
        },
        from: location,
      },
      dropTarget: {
        at: 'explorer:doc',
      },
    } satisfies AffineDNDData;
  }, [docId, location]);

  const handleRename = useAsyncCallback(
    async (newName: string) => {
      await docsService.changeDocTitle(docId, newName);
      track.$.navigationPanel.organize.renameOrganizeItem({ type: 'doc' });
    },
    [docId, docsService]
  );

  const handleDropOnDoc = useAsyncCallback(
    async (data: DropTargetDropEvent<AffineDNDData>) => {
      if (data.treeInstruction?.type === 'make-child') {
        if (data.source.data.entity?.type === 'doc') {
          await docsService.addLinkedDoc(docId, data.source.data.entity.id);
          track.$.navigationPanel.docs.linkDoc({
            control: 'drag',
          });
        } else {
          toast(t['com.affine.rootAppSidebar.doc.link-doc-only']());
        }
      } else {
        onDrop?.(data);
      }
    },
    [docId, docsService, onDrop, t]
  );

  const handleDropEffectOnDoc = useCallback<ExplorerTreeNodeDropEffect>(
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

  const handleDropOnPlaceholder = useAsyncCallback(
    async (data: DropTargetDropEvent<AffineDNDData>) => {
      if (data.source.data.entity?.type === 'doc') {
        // TODO(eyhn): timeout&error handling
        await docsService.addLinkedDoc(docId, data.source.data.entity.id);
        track.$.navigationPanel.docs.linkDoc({
          control: 'drag',
        });
      } else {
        toast(t['com.affine.rootAppSidebar.doc.link-doc-only']());
      }
    },
    [docId, docsService, t]
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

  const docInfoModal = useService(DocInfoService).modal;
  const operations = useExplorerDocNodeOperations(
    docId,
    useMemo(
      () => ({
        openInfoModal: () => docInfoModal.open(docId),
        openNodeCollapsed: () => setCollapsed(false),
      }),
      [docId, docInfoModal, setCollapsed]
    )
  );

  const finalOperations = useMemo(() => {
    if (additionalOperations) {
      return [...operations, ...additionalOperations];
    }
    return operations;
  }, [additionalOperations, operations]);

  if (isInTrash || !docRecord) {
    return null;
  }

  return (
    <ExplorerTreeNode
      icon={Icon}
      name={t.t(docTitle)}
      dndData={dndData}
      onDrop={handleDropOnDoc}
      renameable
      extractEmojiAsIcon={enableEmojiIcon}
      collapsed={collapsed}
      setCollapsed={setCollapsed}
      canDrop={handleCanDrop}
      to={`/${docId}`}
      active={active}
      postfix={
        referencesLoading &&
        !collapsed && (
          <Tooltip
            content={t['com.affine.rootAppSidebar.docs.references-loading']()}
          >
            <div className={styles.loadingIcon}>
              <Loading />
            </div>
          </Tooltip>
        )
      }
      reorderable={reorderable}
      onRename={handleRename}
      childrenPlaceholder={
        searching ? null : <Empty onDrop={handleDropOnPlaceholder} />
      }
      operations={finalOperations}
      dropEffect={handleDropEffectOnDoc}
      data-testid={`explorer-doc-${docId}`}
    >
      {children?.map(child => (
        <ExplorerDocNode
          key={child.docId}
          docId={child.docId}
          explorerKey={collapsedKey}
          reorderable={false}
          location={{
            at: 'explorer:doc:linked-docs',
            docId,
          }}
          isLinked
        />
      ))}
    </ExplorerTreeNode>
  );
};
