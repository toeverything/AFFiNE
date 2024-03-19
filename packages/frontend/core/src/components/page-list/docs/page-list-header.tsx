import { Button, Divider, Menu, Scrollable } from '@affine/component';
import { useAsyncCallback } from '@affine/core/hooks/affine-async-hooks';
import { useNavigateHelper } from '@affine/core/hooks/use-navigate-helper';
import { type Tag, TagService } from '@affine/core/modules/tag';
import type { Collection } from '@affine/env/filter';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import {
  ArrowDownSmallIcon,
  SearchIcon,
  ViewLayersIcon,
} from '@blocksuite/icons';
import { useLiveData, useService } from '@toeverything/infra';
import clsx from 'clsx';
import { nanoid } from 'nanoid';
import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { CollectionService } from '../../../modules/collection';
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

  const title = useMemo(() => {
    return t['com.affine.all-pages.header']();
  }, [t]);

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
  const { jumpToCollections } = useNavigateHelper();

  const handleJumpToCollections = useCallback(() => {
    jumpToCollections(workspaceId);
  }, [jumpToCollections, workspaceId]);

  const collectionService = useService(CollectionService);
  const { node, open } = useEditCollection(config);

  const handleAddPage = useAsyncCallback(async () => {
    const ret = await open({ ...collection }, 'page');
    collectionService.updateCollection(collection.id, () => ret);
  }, [collection, collectionService, open]);

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
  const tagColor = useLiveData(tag.color);
  const tagTitle = useLiveData(tag.value);

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
  const tagService = useService(TagService);
  const filteredLiveData = useMemo(() => {
    if (inputValue) {
      return tagService.filterTagsByName(inputValue);
    }
    return tagService.tags;
  }, [inputValue, tagService]);
  const filteredTags = useLiveData(filteredLiveData);

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
  const tagColor = useLiveData(tag.color);
  const tagTitle = useLiveData(tag.value);
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
