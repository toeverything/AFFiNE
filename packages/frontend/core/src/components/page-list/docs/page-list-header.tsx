import {
  Button,
  Divider,
  Menu,
  RowInput,
  Scrollable,
  useConfirmModal,
} from '@affine/component';
import { useNavigateHelper } from '@affine/core/components/hooks/use-navigate-helper';
import { WorkspaceDialogService } from '@affine/core/modules/dialogs';
import type { DocRecord } from '@affine/core/modules/doc';
import type { Tag } from '@affine/core/modules/tag';
import { TagService } from '@affine/core/modules/tag';
import { WorkbenchService } from '@affine/core/modules/workbench';
import { WorkspaceService } from '@affine/core/modules/workspace';
import { inferOpenMode } from '@affine/core/utils';
import type { Collection } from '@affine/env/filter';
import { useI18n } from '@affine/i18n';
import { track } from '@affine/track';
import type { DocMode } from '@blocksuite/affine/model';
import {
  ArrowDownSmallIcon,
  SearchIcon,
  ViewLayersIcon,
} from '@blocksuite/icons/rc';
import { useLiveData, useService, useServices } from '@toeverything/infra';
import clsx from 'clsx';
import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { usePageHelper } from '../../../blocksuite/block-suite-page-list/utils';
import { CollectionService } from '../../../modules/collection';
import { createTagFilter } from '../filter/utils';
import { SaveAsCollectionButton } from '../view';
import * as styles from './page-list-header.css';
import { PageListNewPageButton } from './page-list-new-page-button';

export const PageListHeader = () => {
  const t = useI18n();
  const { workspaceService, workspaceDialogService, workbenchService } =
    useServices({
      WorkspaceService,
      WorkspaceDialogService,
      WorkbenchService,
    });

  const workbench = workbenchService.workbench;
  const workspace = workspaceService.workspace;
  const { createEdgeless, createPage } = usePageHelper(workspace.docCollection);

  const title = useMemo(() => {
    return t['com.affine.all-pages.header']();
  }, [t]);

  const handleOpenDocs = useCallback(
    (result: {
      docIds: string[];
      entryId?: string;
      isWorkspaceFile?: boolean;
    }) => {
      const { docIds, entryId, isWorkspaceFile } = result;
      // If the imported file is a workspace file, open the entry page.
      if (isWorkspaceFile && entryId) {
        workbench.openDoc(entryId);
      } else if (!docIds.length) {
        return;
      }
      // Open all the docs when there are multiple docs imported.
      if (docIds.length > 1) {
        workbench.openAll();
      } else {
        // Otherwise, open the only doc.
        workbench.openDoc(docIds[0]);
      }
    },
    [workbench]
  );

  const onImportFile = useCallback(() => {
    track.$.header.importModal.open();
    workspaceDialogService.open('import', undefined, payload => {
      if (!payload) {
        return;
      }
      handleOpenDocs(payload);
    });
  }, [workspaceDialogService, handleOpenDocs]);

  return (
    <div className={styles.docListHeader}>
      <div className={styles.docListHeaderTitle}>{title}</div>
      <PageListNewPageButton
        size="small"
        testId="new-page-button-trigger"
        onCreateEdgeless={e => createEdgeless({ at: inferOpenMode(e) })}
        onCreatePage={e =>
          createPage('page' as DocMode, { at: inferOpenMode(e) })
        }
        onCreateDoc={e => createPage(undefined, { at: inferOpenMode(e) })}
        onImportFile={onImportFile}
      >
        <div className={styles.buttonText}>{t['New Page']()}</div>
      </PageListNewPageButton>
    </div>
  );
};
export const CollectionPageListHeader = ({
  collection,
  workspaceId,
}: {
  collection: Collection;
  workspaceId: string;
}) => {
  const t = useI18n();
  const { jumpToCollections } = useNavigateHelper();
  const { collectionService, workspaceService, workspaceDialogService } =
    useServices({
      CollectionService,
      WorkspaceService,
      WorkspaceDialogService,
    });

  const handleJumpToCollections = useCallback(() => {
    jumpToCollections(workspaceId);
  }, [jumpToCollections, workspaceId]);

  const handleEdit = useCallback(() => {
    workspaceDialogService.open('collection-editor', {
      collectionId: collection.id,
    });
  }, [collection, workspaceDialogService]);

  const workspace = workspaceService.workspace;
  const { createEdgeless, createPage } = usePageHelper(workspace.docCollection);
  const { openConfirmModal } = useConfirmModal();

  const createAndAddDocument = useCallback(
    (createDocumentFn: () => DocRecord) => {
      const newDoc = createDocumentFn();
      collectionService.addPageToCollection(collection.id, newDoc.id);
    },
    [collection.id, collectionService]
  );

  const onConfirmAddDocument = useCallback(
    (createDocumentFn: () => DocRecord) => {
      openConfirmModal({
        title: t['com.affine.collection.add-doc.confirm.title'](),
        description: t['com.affine.collection.add-doc.confirm.description'](),
        cancelText: t['Cancel'](),
        confirmText: t['Confirm'](),
        confirmButtonOptions: {
          variant: 'primary',
        },
        onConfirm: () => createAndAddDocument(createDocumentFn),
      });
    },
    [openConfirmModal, t, createAndAddDocument]
  );

  const createPageModeDoc = useCallback(
    () => createPage('page' as DocMode),
    [createPage]
  );

  const onCreateEdgeless = useCallback(
    () => onConfirmAddDocument(createEdgeless),
    [createEdgeless, onConfirmAddDocument]
  );
  const onCreatePage = useCallback(() => {
    onConfirmAddDocument(createPageModeDoc);
  }, [createPageModeDoc, onConfirmAddDocument]);
  const onCreateDoc = useCallback(() => {
    onConfirmAddDocument(createPage);
  }, [createPage, onConfirmAddDocument]);

  return (
    <div className={styles.docListHeader}>
      <div className={styles.docListHeaderTitle}>
        <div style={{ cursor: 'pointer' }} onClick={handleJumpToCollections}>
          {t['com.affine.collections.header']()} /
        </div>
        <div className={styles.titleIcon}>
          <ViewLayersIcon />
        </div>
        <div className={styles.titleCollectionName}>{collection.name}</div>
      </div>
      <div className={styles.rightButtonGroup}>
        <Button onClick={handleEdit}>{t['Edit']()}</Button>
        <PageListNewPageButton
          size="small"
          testId="new-page-button-trigger"
          onCreateDoc={onCreateDoc}
          onCreateEdgeless={onCreateEdgeless}
          onCreatePage={onCreatePage}
        >
          <div className={styles.buttonText}>{t['New Page']()}</div>
        </PageListNewPageButton>
      </div>
    </div>
  );
};

export const TagPageListHeader = ({
  tag,
  workspaceId,
}: {
  tag: Tag;
  workspaceId: string;
}) => {
  const tagColor = useLiveData(tag.color$);
  const tagTitle = useLiveData(tag.value$);

  const t = useI18n();
  const { jumpToTags, jumpToCollection } = useNavigateHelper();
  const collectionService = useService(CollectionService);
  const [openMenu, setOpenMenu] = useState(false);

  const handleJumpToTags = useCallback(() => {
    jumpToTags(workspaceId);
  }, [jumpToTags, workspaceId]);

  const saveToCollection = useCallback(
    (collection: Collection) => {
      collectionService.addCollection({
        ...collection,
        filterList: [createTagFilter(tag.id)],
      });
      jumpToCollection(workspaceId, collection.id);
    },
    [collectionService, tag.id, jumpToCollection, workspaceId]
  );

  return (
    <div className={styles.docListHeader}>
      <div className={styles.docListHeaderTitle}>
        <div
          style={{ cursor: 'pointer', lineHeight: '1.4em' }}
          onClick={handleJumpToTags}
        >
          {t['Tags']()} /
        </div>
        <Menu
          rootOptions={{
            open: openMenu,
            onOpenChange: setOpenMenu,
          }}
          contentOptions={{
            side: 'bottom',
            align: 'start',
            sideOffset: 18,
            avoidCollisions: false,
            className: styles.tagsMenu,
          }}
          items={<SwitchTag onClick={setOpenMenu} />}
        >
          <div className={styles.tagSticky}>
            <div
              className={styles.tagIndicator}
              style={{
                backgroundColor: tagColor,
              }}
            />
            <div className={styles.tagLabel}>{tagTitle}</div>
            <ArrowDownSmallIcon className={styles.arrowDownSmallIcon} />
          </div>
        </Menu>
      </div>
      <SaveAsCollectionButton onConfirm={saveToCollection} />
    </div>
  );
};

interface SwitchTagProps {
  onClick: (open: boolean) => void;
}

export const SwitchTag = ({ onClick }: SwitchTagProps) => {
  const t = useI18n();
  const [inputValue, setInputValue] = useState('');
  const tagList = useService(TagService).tagList;
  const filteredTags = useLiveData(
    inputValue ? tagList.filterTagsByName$(inputValue) : tagList.tags$
  );

  const onInputChange = useCallback((value: string) => {
    setInputValue(value);
  }, []);

  const handleClick = useCallback(() => {
    setInputValue('');
    onClick(false);
  }, [onClick]);

  return (
    <div className={styles.tagsEditorRoot}>
      <div className={styles.tagsEditorSelectedTags}>
        <SearchIcon className={styles.searchIcon} />
        <RowInput
          value={inputValue}
          onChange={onInputChange}
          autoFocus
          className={styles.searchInput}
          placeholder={t['com.affine.search-tags.placeholder']()}
        />
      </div>
      <Divider />
      <div className={styles.tagsEditorTagsSelector}>
        <Scrollable.Root>
          <Scrollable.Viewport
            className={styles.tagSelectorTagsScrollContainer}
          >
            {filteredTags.map(tag => {
              return <TagLink key={tag.id} tag={tag} onClick={handleClick} />;
            })}
            {filteredTags.length === 0 ? (
              <div className={clsx(styles.tagSelectorItem, 'disable')}>
                {t['Find 0 result']()}
              </div>
            ) : null}
          </Scrollable.Viewport>
          <Scrollable.Scrollbar style={{ transform: 'translateX(6px)' }} />
        </Scrollable.Root>
      </div>
    </div>
  );
};

const TagLink = ({ tag, onClick }: { tag: Tag; onClick: () => void }) => {
  const tagColor = useLiveData(tag.color$);
  const tagTitle = useLiveData(tag.value$);
  return (
    <Link
      key={tag.id}
      className={styles.tagSelectorItem}
      data-tag-id={tag.id}
      data-tag-value={tagTitle}
      to={`/tag/${tag.id}`}
      onClick={onClick}
    >
      <div className={styles.tagIcon} style={{ background: tagColor }} />
      <div className={styles.tagSelectorItemText}>{tagTitle}</div>
    </Link>
  );
};
