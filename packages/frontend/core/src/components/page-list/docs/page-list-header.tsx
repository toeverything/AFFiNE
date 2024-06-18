import {
  Button,
  Divider,
  Menu,
  Scrollable,
  useConfirmModal,
} from '@affine/component';
import { useAsyncCallback } from '@affine/core/hooks/affine-async-hooks';
import { useNavigateHelper } from '@affine/core/hooks/use-navigate-helper';
import type { Tag } from '@affine/core/modules/tag';
import { TagService } from '@affine/core/modules/tag';
import { mixpanel } from '@affine/core/utils';
import type { Collection } from '@affine/env/filter';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import {
  ArrowDownSmallIcon,
  SearchIcon,
  ViewLayersIcon,
} from '@blocksuite/icons/rc';
import type { Doc as BlockSuiteDoc } from '@blocksuite/store';
import { useLiveData, useService, WorkspaceService } from '@toeverything/infra';
import clsx from 'clsx';
import { nanoid } from 'nanoid';
import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { CollectionService } from '../../../modules/collection';
import { usePageHelper } from '../../blocksuite/block-suite-page-list/utils';
import { createTagFilter } from '../filter/utils';
import { createEmptyCollection } from '../use-collection-manager';
import type { AllPageListConfig } from '../view/edit-collection/edit-collection';
import {
  useEditCollection,
  useEditCollectionName,
} from '../view/use-edit-collection';
import * as styles from './page-list-header.css';
import { PageListNewPageButton } from './page-list-new-page-button';

export const PageListHeader = () => {
  const t = useAFFiNEI18N();
  const workspace = useService(WorkspaceService).workspace;
  const { importFile, createEdgeless, createPage } = usePageHelper(
    workspace.docCollection
  );

  const title = useMemo(() => {
    return t['com.affine.all-pages.header']();
  }, [t]);

  const onImportFile = useAsyncCallback(async () => {
    const options = await importFile();
    if (options.isWorkspaceFile) {
      mixpanel.track('WorkspaceCreated', {
        page: 'doc library',
        segment: 'all doc',
        module: 'doc list header',
        control: 'import button',
        type: 'imported workspace',
      });
    } else {
      mixpanel.track('DocCreated', {
        page: 'doc library',
        segment: 'all doc',
        module: 'doc list header',
        control: 'import button',
        type: 'imported doc',
        // category
      });
    }
  }, [importFile]);

  return (
    <div className={styles.docListHeader}>
      <div className={styles.docListHeaderTitle}>{title}</div>
      <PageListNewPageButton
        size="small"
        testId="new-page-button-trigger"
        onCreateEdgeless={createEdgeless}
        onCreatePage={createPage}
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
  config,
}: {
  config: AllPageListConfig;
  collection: Collection;
  workspaceId: string;
}) => {
  const t = useAFFiNEI18N();
  const { jumpToCollections } = useNavigateHelper();

  const handleJumpToCollections = useCallback(() => {
    jumpToCollections(workspaceId);
  }, [jumpToCollections, workspaceId]);

  const collectionService = useService(CollectionService);
  const { node, open } = useEditCollection(config);

  const handleEdit = useAsyncCallback(async () => {
    const ret = await open({ ...collection }, 'page');
    collectionService.updateCollection(collection.id, () => ret);
  }, [collection, collectionService, open]);

  const workspace = useService(WorkspaceService).workspace;
  const { createEdgeless, createPage } = usePageHelper(workspace.docCollection);
  const { openConfirmModal } = useConfirmModal();

  const createAndAddDocument = useCallback(
    (createDocumentFn: () => BlockSuiteDoc) => {
      const newDoc = createDocumentFn();
      collectionService.addPageToCollection(collection.id, newDoc.id);
    },
    [collection.id, collectionService]
  );

  const onConfirmAddDocument = useCallback(
    (createDocumentFn: () => BlockSuiteDoc) => {
      openConfirmModal({
        title: t['com.affine.collection.add-doc.confirm.title'](),
        description: t['com.affine.collection.add-doc.confirm.description'](),
        cancelText: t['Cancel'](),
        confirmButtonOptions: {
          type: 'primary',
          children: t['Confirm'](),
        },
        onConfirm: () => createAndAddDocument(createDocumentFn),
      });
    },
    [openConfirmModal, t, createAndAddDocument]
  );

  const onCreateEdgeless = useCallback(
    () => onConfirmAddDocument(createEdgeless),
    [createEdgeless, onConfirmAddDocument]
  );
  const onCreatePage = useCallback(
    () => onConfirmAddDocument(createPage),
    [createPage, onConfirmAddDocument]
  );

  return (
    <>
      {node}
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
          <Button className={styles.addPageButton} onClick={handleEdit}>
            {t['Edit']()}
          </Button>
          <PageListNewPageButton
            size="small"
            testId="new-page-button-trigger"
            onCreateEdgeless={onCreateEdgeless}
            onCreatePage={onCreatePage}
          >
            <div className={styles.buttonText}>{t['New Page']()}</div>
          </PageListNewPageButton>
        </div>
      </div>
    </>
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

  const t = useAFFiNEI18N();
  const { jumpToTags, jumpToCollection } = useNavigateHelper();
  const collectionService = useService(CollectionService);
  const [openMenu, setOpenMenu] = useState(false);
  const { open, node } = useEditCollectionName({
    title: t['com.affine.editCollection.saveCollection'](),
    showTips: true,
  });

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
  const handleClick = useCallback(() => {
    open('')
      .then(name => {
        return saveToCollection(createEmptyCollection(nanoid(), { name }));
      })
      .catch(err => {
        console.error(err);
      });
  }, [open, saveToCollection]);

  return (
    <>
      {node}
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
        <Button className={styles.addPageButton} onClick={handleClick}>
          {t['com.affine.editCollection.saveCollection']()}
        </Button>
      </div>
    </>
  );
};

interface SwitchTagProps {
  onClick: (open: boolean) => void;
}

export const SwitchTag = ({ onClick }: SwitchTagProps) => {
  const t = useAFFiNEI18N();
  const [inputValue, setInputValue] = useState('');
  const tagList = useService(TagService).tagList;
  const filteredTags = useLiveData(
    inputValue ? tagList.filterTagsByName$(inputValue) : tagList.tags$
  );

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setInputValue(e.target.value);
    },
    []
  );

  const handleClick = useCallback(() => {
    setInputValue('');
    onClick(false);
  }, [onClick]);

  return (
    <div className={styles.tagsEditorRoot}>
      <div className={styles.tagsEditorSelectedTags}>
        <SearchIcon className={styles.searchIcon} />
        <input
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
