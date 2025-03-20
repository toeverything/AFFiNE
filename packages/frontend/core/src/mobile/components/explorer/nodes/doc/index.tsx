import { Loading } from '@affine/component';
import { DocPermissionGuard } from '@affine/core/components/guard/doc-guard';
import { WorkspaceDialogService } from '@affine/core/modules/dialogs';
import { DocsService } from '@affine/core/modules/doc';
import { DocDisplayMetaService } from '@affine/core/modules/doc-display-meta';
import { DocsSearchService } from '@affine/core/modules/docs-search';
import type { NodeOperation } from '@affine/core/modules/explorer';
import { FeatureFlagService } from '@affine/core/modules/feature-flag';
import { GlobalContextService } from '@affine/core/modules/global-context';
import { useI18n } from '@affine/i18n';
import {
  LiveData,
  useLiveData,
  useService,
  useServices,
} from '@toeverything/infra';
import { useCallback, useLayoutEffect, useMemo, useState } from 'react';

import { AddItemPlaceholder } from '../../layouts/add-item-placeholder';
import { ExplorerTreeNode } from '../../tree/node';
import {
  useExplorerDocNodeOperations,
  useExplorerDocNodeOperationsMenu,
} from './operations';
import * as styles from './styles.css';

export const ExplorerDocNode = ({
  docId,
  isLinked,
  operations: additionalOperations,
}: {
  docId: string;
  isLinked?: boolean;
  operations?: NodeOperation[];
}) => {
  const t = useI18n();
  const {
    docsSearchService,
    docsService,
    globalContextService,
    docDisplayMetaService,
    featureFlagService,
  } = useServices({
    DocsSearchService,
    DocsService,
    GlobalContextService,
    DocDisplayMetaService,
    FeatureFlagService,
  });
  const active =
    useLiveData(globalContextService.globalContext.docId.$) === docId;
  const [collapsed, setCollapsed] = useState(true);

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

  const workspaceDialogService = useService(WorkspaceDialogService);
  const option = useMemo(
    () => ({
      openInfoModal: () => workspaceDialogService.open('doc-info', { docId }),
      openNodeCollapsed: () => setCollapsed(false),
    }),
    [docId, workspaceDialogService]
  );
  const operations = useExplorerDocNodeOperationsMenu(docId, option);
  const { handleAddLinkedPage } = useExplorerDocNodeOperations(docId, option);

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
      data-testid={`explorer-doc-${docId}`}
    >
      <DocPermissionGuard docId={docId} permission="Doc_Read">
        {canRead =>
          canRead
            ? children?.map((child, index) => (
                <ExplorerDocNode
                  key={`${child.docId}-${index}`}
                  docId={child.docId}
                  isLinked
                />
              ))
            : null
        }
      </DocPermissionGuard>
      <DocPermissionGuard docId={docId} permission="Doc_Update">
        {canEdit =>
          canEdit ? (
            <AddItemPlaceholder
              label={t['com.affine.rootAppSidebar.explorer.doc-add-tooltip']()}
              onClick={handleAddLinkedPage}
            />
          ) : null
        }
      </DocPermissionGuard>
    </ExplorerTreeNode>
  );
};
