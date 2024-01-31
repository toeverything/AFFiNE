import { Button } from '@affine/component';
import { useAsyncCallback } from '@affine/core/hooks/affine-async-hooks';
import { useNavigateHelper } from '@affine/core/hooks/use-navigate-helper';
import type { Collection, Tag } from '@affine/env/filter';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { ViewLayersIcon } from '@blocksuite/icons';
import { useService } from '@toeverything/infra/di';
import { nanoid } from 'nanoid';
import { useCallback, useMemo } from 'react';

import { CollectionService } from '../../../modules/collection';
import { createTagFilter } from '../filter/utils';
import {
  createEmptyCollection,
  useCollectionManager,
} from '../use-collection-manager';
import { tagColorMap } from '../utils';
import type { AllPageListConfig } from '../view/edit-collection/edit-collection';
import {
  useEditCollection,
  useEditCollectionName,
} from '../view/use-edit-collection';
import * as styles from './page-list-header.css';
import { PageListNewPageButton } from './page-list-new-page-button';

export const PageListHeader = ({ workspaceId }: { workspaceId: string }) => {
  const t = useAFFiNEI18N();
  const setting = useCollectionManager(useService(CollectionService));
  const { jumpToCollections } = useNavigateHelper();

  const handleJumpToCollections = useCallback(() => {
    jumpToCollections(workspaceId);
  }, [jumpToCollections, workspaceId]);

  const title = useMemo(() => {
    if (setting.isDefault) {
      return t['com.affine.all-pages.header']();
    }
    return (
      <>
        <div style={{ cursor: 'pointer' }} onClick={handleJumpToCollections}>
          {t['com.affine.collections.header']()} /
        </div>
        <div className={styles.titleIcon}>
          <ViewLayersIcon />
        </div>
        <div className={styles.titleCollectionName}>
          {setting.currentCollection.name}
        </div>
      </>
    );
  }, [
    handleJumpToCollections,
    setting.currentCollection.name,
    setting.isDefault,
    t,
  ]);

  return (
    <div className={styles.docListHeader}>
      <div className={styles.docListHeaderTitle}>{title}</div>
      <PageListNewPageButton testId="new-page-button-trigger">
        {t['New Page']()}
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
  const setting = useCollectionManager(useService(CollectionService));
  const { jumpToCollections } = useNavigateHelper();

  const handleJumpToCollections = useCallback(() => {
    jumpToCollections(workspaceId);
  }, [jumpToCollections, workspaceId]);

  const { updateCollection } = useCollectionManager(
    useService(CollectionService)
  );
  const { node, open } = useEditCollection(config);

  const handleAddPage = useAsyncCallback(async () => {
    const ret = await open({ ...collection }, 'page');
    updateCollection(ret);
  }, [collection, open, updateCollection]);

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
          <div className={styles.titleCollectionName}>
            {setting.currentCollection.name}
          </div>
        </div>
        <Button className={styles.addPageButton} onClick={handleAddPage}>
          {t['com.affine.collection.addPages']()}
        </Button>
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
  const t = useAFFiNEI18N();
  const { jumpToTags, jumpToCollection } = useNavigateHelper();
  const setting = useCollectionManager(useService(CollectionService));
  const { open, node } = useEditCollectionName({
    title: t['com.affine.editCollection.saveCollection'](),
    showTips: true,
  });

  const handleJumpToTags = useCallback(() => {
    jumpToTags(workspaceId);
  }, [jumpToTags, workspaceId]);

  const saveToCollection = useCallback(
    (collection: Collection) => {
      setting.createCollection({
        ...collection,
        filterList: [createTagFilter(tag.id)],
      });
      jumpToCollection(workspaceId, collection.id);
    },
    [setting, tag.id, jumpToCollection, workspaceId]
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
          <div className={styles.tagSticky}>
            <div
              className={styles.tagIndicator}
              style={{
                backgroundColor: tagColorMap(tag.color),
              }}
            />
            <div className={styles.tagLabel}>{tag.value}</div>
          </div>
        </div>
        <Button className={styles.addPageButton} onClick={handleClick}>
          {t['com.affine.editCollection.saveCollection']()}
        </Button>
      </div>
    </>
  );
};
