import { usePromptModal } from '@affine/component';
import { useNavigateHelper } from '@affine/core/components/hooks/use-navigate-helper';
import { CollectionService } from '@affine/core/modules/collection';
import { WorkspaceService } from '@affine/core/modules/workspace';
import { useI18n } from '@affine/i18n';
import { ViewLayersIcon } from '@blocksuite/icons/rc';
import { useService } from '@toeverything/infra';
import { useCallback } from 'react';

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
  const { openPromptModal } = usePromptModal();

  const showAction = true;

  const handleCreateCollection = useCallback(() => {
    openPromptModal({
      title: t['com.affine.editCollection.saveCollection'](),
      label: t['com.affine.editCollectionName.name'](),
      inputOptions: {
        placeholder: t['com.affine.editCollectionName.name.placeholder'](),
      },
      children: t['com.affine.editCollectionName.createTips'](),
      confirmText: t['com.affine.editCollection.save'](),
      cancelText: t['com.affine.editCollection.button.cancel'](),
      confirmButtonOptions: {
        variant: 'primary',
      },
      onConfirm(name) {
        const id = collectionService.createCollection({ name });
        navigateHelper.jumpToCollection(currentWorkspace.id, id);
      },
    });
  }, [
    collectionService,
    currentWorkspace.id,
    navigateHelper,
    openPromptModal,
    t,
  ]);

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
