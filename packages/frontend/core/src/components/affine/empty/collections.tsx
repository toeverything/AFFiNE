import { useNavigateHelper } from '@affine/core/components/hooks/use-navigate-helper';
import { CollectionService } from '@affine/core/modules/collection';
import { useI18n } from '@affine/i18n';
import { ViewLayersIcon } from '@blocksuite/icons/rc';
import { useService, WorkspaceService } from '@toeverything/infra';
import { nanoid } from 'nanoid';
import { useCallback } from 'react';

import { createEmptyCollection, useEditCollectionName } from '../../page-list';
import { ActionButton } from './action-button';
import collectionListDark from './assets/collection-list.dark.png';
import collectionListLight from './assets/collection-list.light.png';
import { EmptyLayout } from './layout';
import type { UniversalEmptyProps } from './types';

export const EmptyCollections = (props: UniversalEmptyProps) => {
  const t = useI18n();
  const collectionService = useService(CollectionService);
  const currentWorkspace = useService(WorkspaceService).workspace;

  const navigateHelper = useNavigateHelper();
  const { open } = useEditCollectionName({
    title: t['com.affine.editCollection.createCollection'](),
    showTips: true,
  });

  const showAction = true;

  const handleCreateCollection = useCallback(() => {
    open('')
      .then(name => {
        const id = nanoid();
        collectionService.addCollection(createEmptyCollection(id, { name }));
        navigateHelper.jumpToCollection(currentWorkspace.id, id);
      })
      .catch(err => {
        console.error(err);
      });
  }, [collectionService, currentWorkspace, navigateHelper, open]);

  return (
    <EmptyLayout
      illustrationLight={collectionListLight}
      illustrationDark={collectionListDark}
      title={t['com.affine.empty.collections.title']()}
      description={t['com.affine.empty.collections.description']()}
      action={
        showAction ? (
          <ActionButton
            prefix={<ViewLayersIcon />}
            onClick={handleCreateCollection}
          >
            {t['com.affine.empty.collections.action.new-collection']()}
          </ActionButton>
        ) : null
      }
      {...props}
    />
  );
};
