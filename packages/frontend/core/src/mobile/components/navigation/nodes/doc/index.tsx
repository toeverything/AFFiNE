import { Loading } from '@affine/component';
import { Guard } from '@affine/core/components/guard';
import type { NodeOperation } from '@affine/core/desktop/components/navigation-panel';
import { WorkspaceDialogService } from '@affine/core/modules/dialogs';
import { DocsService } from '@affine/core/modules/doc';
import { DocDisplayMetaService } from '@affine/core/modules/doc-display-meta';
import { DocsSearchService } from '@affine/core/modules/docs-search';
import { FeatureFlagService } from '@affine/core/modules/feature-flag';
import { GlobalContextService } from '@affine/core/modules/global-context';
import { NavigationPanelService } from '@affine/core/modules/navigation-panel';
import { WorkspaceService } from '@affine/core/modules/workspace';
import { useI18n } from '@affine/i18n';
import {
  LiveData,
  MANUALLY_STOP,
  useLiveData,
  useService,
  useServices,
} from '@toeverything/infra';
import { useCallback, useLayoutEffect, useMemo, useState } from 'react';

import { AddItemPlaceholder } from '../../layouts/add-item-placeholder';
import { NavigationPanelTreeNode } from '../../tree/node';
import {
  useNavigationPanelDocNodeOperations,
  useNavigationPanelDocNodeOperationsMenu,
} from './operations';
import * as styles from './styles.css';

export const NavigationPanelDocNode = ({
  docId,
  isLinked,
  operations: additionalOperations,
  parentPath,
}: {
  docId: string;
  isLinked?: boolean;
  operations?: NodeOperation[];
  parentPath: string[];
}) => {
  const t = useI18n();
  const {
    docsSearchService,
    docsService,
    globalContextService,
    docDisplayMetaService,
    featureFlagService,
    workspaceService,
  } = useServices({
    DocsSearchService,
    WorkspaceService,
    DocsService,
    GlobalContextService,
    DocDisplayMetaService,
    FeatureFlagService,
  });
  const navigationPanelService = useService(NavigationPanelService);
  const active =
    useLiveData(globalContextService.globalContext.docId.$) === docId;
  const path = useMemo(
    () => [...parentPath, `doc-${docId}`],
    [parentPath, docId]
  );
  const collapsed = useLiveData(navigationPanelService.collapsed$(path));
  const setCollapsed = useCallback(
    (value: boolean) => {
      navigationPanelService.setCollapsed(path, value);
    },
    [navigationPanelService, path]
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
    ({ className }: { className?: string }) => (
      <DocIcon className={className} />
    ),
    [DocIcon]
  );

  const children = useLiveData(
    useMemo(
      () => LiveData.from(docsSearchService.watchRefsFrom(docId), null),
      [docsSearchService, docId]
    )
  );

  const [referencesLoading, setReferencesLoading] = useState(true);
  useLayoutEffect(() => {
    if (collapsed) {
      return;
    }
    const abortController = new AbortController();
    const undoSync = workspaceService.workspace.engine.doc.addPriority(
      docId,
      10
    );
    const undoIndexer = docsSearchService.indexer.addPriority(docId, 10);
    docsSearchService.indexer
      .waitForDocCompleted(docId, abortController.signal)
      .then(() => {
        setReferencesLoading(false);
      })
      .catch(err => {
        if (err !== MANUALLY_STOP) {
          console.error(err);
        }
      });
    return () => {
      undoSync();
      undoIndexer();
      abortController.abort(MANUALLY_STOP);
    };
  }, [docId, docsSearchService, workspaceService, collapsed]);

  const workspaceDialogService = useService(WorkspaceDialogService);
  const option = useMemo(
    () => ({
      openInfoModal: () => workspaceDialogService.open('doc-info', { docId }),
      openNodeCollapsed: () => setCollapsed(false),
    }),
    [docId, setCollapsed, workspaceDialogService]
  );
  const operations = useNavigationPanelDocNodeOperationsMenu(docId, option);
  const { handleAddLinkedPage } = useNavigationPanelDocNodeOperations(
    docId,
    option
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
    <NavigationPanelTreeNode
      icon={Icon}
      name={t.t(docTitle)}
      extractEmojiAsIcon={enableEmojiIcon}
      collapsed={collapsed}
      setCollapsed={setCollapsed}
      to={`/${docId}`}
      active={active}
      postfix={
        referencesLoading &&
        !collapsed && (
          <div className={styles.loadingIcon}>
            <Loading />
          </div>
        )
      }
      operations={finalOperations}
      data-testid={`navigation-panel-doc-${docId}`}
    >
      <Guard docId={docId} permission="Doc_Read">
        {canRead =>
          canRead
            ? children?.map((child, index) => (
                <NavigationPanelDocNode
                  key={`${child.docId}-${index}`}
                  docId={child.docId}
                  isLinked
                  parentPath={path}
                />
              ))
            : null
        }
      </Guard>
      <Guard docId={docId} permission="Doc_Update">
        {canEdit =>
          canEdit ? (
            <AddItemPlaceholder
              label={t['com.affine.rootAppSidebar.explorer.doc-add-tooltip']()}
              onClick={handleAddLinkedPage}
            />
          ) : null
        }
      </Guard>
    </NavigationPanelTreeNode>
  );
};
