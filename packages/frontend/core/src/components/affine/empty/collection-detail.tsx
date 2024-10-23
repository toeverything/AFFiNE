import { WorkspaceDialogService } from '@affine/core/modules/dialogs';
import type { Collection } from '@affine/env/filter';
import { useI18n } from '@affine/i18n';
import { AllDocsIcon, FilterIcon } from '@blocksuite/icons/rc';
import { useService } from '@toeverything/infra';
import { useCallback } from 'react';

import { ActionButton } from './action-button';
import collectionDetailDark from './assets/collection-detail.dark.png';
import collectionDetailLight from './assets/collection-detail.light.png';
import { EmptyLayout } from './layout';
import { actionGroup } from './style.css';
import type { UniversalEmptyProps } from './types';

export interface EmptyCollectionDetailProps extends UniversalEmptyProps {
  collection: Collection;
}

export const EmptyCollectionDetail = ({
  collection,
  ...props
}: EmptyCollectionDetailProps) => {
  const t = useI18n();

  return (
    <EmptyLayout
      illustrationLight={collectionDetailLight}
      illustrationDark={collectionDetailDark}
      title={t['com.affine.empty.collection-detail.title']()}
      description={t['com.affine.empty.collection-detail.description']()}
      action={
        BUILD_CONFIG.isMobileEdition ? null : (
          <Actions collection={collection} />
        )
      }
      {...props}
    />
  );
};

const Actions = ({ collection }: { collection: Collection }) => {
  const t = useI18n();
  const workspaceDialogService = useService(WorkspaceDialogService);

  const openAddDocs = useCallback(() => {
    workspaceDialogService.open('collection-editor', {
      collectionId: collection.id,
      mode: 'page',
    });
  }, [collection, workspaceDialogService]);

  const openAddRules = useCallback(() => {
    workspaceDialogService.open('collection-editor', {
      collectionId: collection.id,
      mode: 'rule',
    });
  }, [collection, workspaceDialogService]);

  return (
    <div className={actionGroup}>
      <ActionButton prefix={<AllDocsIcon />} onClick={openAddDocs}>
        {t['com.affine.empty.collection-detail.action.add-doc']()}
      </ActionButton>

      <ActionButton prefix={<FilterIcon />} onClick={openAddRules}>
        {t['com.affine.empty.collection-detail.action.add-rule']()}
      </ActionButton>
    </div>
  );
};
