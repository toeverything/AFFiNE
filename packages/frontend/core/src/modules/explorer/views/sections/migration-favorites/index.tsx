import { IconButton, useConfirmModal } from '@affine/component';
import { ExplorerTreeRoot } from '@affine/core/modules/explorer/views/tree';
import { MigrationFavoriteItemsAdapter } from '@affine/core/modules/favorite';
import { Trans, useI18n } from '@affine/i18n';
import { track } from '@affine/track';
import { BroomIcon, HelpIcon } from '@blocksuite/icons/rc';
import { DocsService, useLiveData, useServices } from '@toeverything/infra';
import { useCallback } from 'react';

import { EXPLORER_KEY } from '../../../config';
import { CollapsibleSection } from '../../layouts/collapsible-section';
import { ExplorerCollectionNode } from '../../nodes/collection';
import { ExplorerDocNode } from '../../nodes/doc';
import * as styles from './styles.css';

export const ExplorerMigrationFavorites = () => {
  const t = useI18n();

  const { migrationFavoriteItemsAdapter, docsService } = useServices({
    MigrationFavoriteItemsAdapter,
    DocsService,
  });

  const docs = useLiveData(docsService.list.docs$);
  const trashDocs = useLiveData(docsService.list.trashDocs$);
  const migrated = useLiveData(migrationFavoriteItemsAdapter.migrated$);
  const { openConfirmModal } = useConfirmModal();

  const favorites = useLiveData(
    migrationFavoriteItemsAdapter.favorites$.map(favs => {
      return favs.filter(fav => {
        if (fav.type === 'doc') {
          return (
            docs.some(doc => doc.id === fav.id) &&
            !trashDocs.some(doc => doc.id === fav.id)
          );
        }
        return true;
      });
    })
  );

  const handleClickClear = useCallback(() => {
    openConfirmModal({
      title: t['com.affine.rootAppSidebar.migration-data.clean-all'](),
      description: (
        <Trans
          i18nKey="com.affine.rootAppSidebar.migration-data.clean-all.description"
          components={{
            b: <b className={styles.descriptionHighlight} />,
          }}
        />
      ),
      confirmText:
        t['com.affine.rootAppSidebar.migration-data.clean-all.confirm'](),
      confirmButtonOptions: {
        variant: 'primary',
      },
      cancelText:
        t['com.affine.rootAppSidebar.migration-data.clean-all.cancel'](),
      onConfirm() {
        migrationFavoriteItemsAdapter.markFavoritesMigrated();
      },
    });
  }, [migrationFavoriteItemsAdapter, openConfirmModal, t]);

  const handleClickHelp = useCallback(() => {
    openConfirmModal({
      title: t['com.affine.rootAppSidebar.migration-data.help'](),
      description: (
        <Trans
          i18nKey="com.affine.rootAppSidebar.migration-data.help.description"
          components={{
            b: <b className={styles.descriptionHighlight} />,
          }}
        />
      ),
      confirmText: t['com.affine.rootAppSidebar.migration-data.help.confirm'](),
      confirmButtonOptions: {
        variant: 'primary',
      },
      cancelText:
        t['com.affine.rootAppSidebar.migration-data.help.clean-all'](),
      cancelButtonOptions: {
        prefix: <BroomIcon />,
        onClick: () => {
          requestAnimationFrame(() => {
            handleClickClear();
          });
        },
      },
    });
    track.$.navigationPanel.migrationData.openMigrationDataHelp();
  }, [handleClickClear, openConfirmModal, t]);

  if (favorites.length === 0 || migrated) {
    return null;
  }

  return (
    <CollapsibleSection
      name="migrationFavorites"
      className={styles.container}
      title={t['com.affine.rootAppSidebar.migration-data']()}
      actions={
        <>
          <IconButton
            data-testid="explorer-bar-favorite-migration-clear-button"
            onClick={handleClickClear}
            size="16"
          >
            <BroomIcon />
          </IconButton>
          <IconButton
            data-testid="explorer-bar-favorite-migration-help-button"
            size="16"
            onClick={handleClickHelp}
          >
            <HelpIcon />
          </IconButton>
        </>
      }
    >
      <ExplorerTreeRoot>
        {favorites.map((favorite, i) => (
          <ExplorerMigrationFavoriteNode
            key={favorite.id + ':' + i}
            favorite={favorite}
          />
        ))}
      </ExplorerTreeRoot>
    </CollapsibleSection>
  );
};

const childLocation = {
  at: 'explorer:migration-data:list' as const,
};
const ExplorerMigrationFavoriteNode = ({
  favorite,
}: {
  favorite: {
    id: string;
    type: 'collection' | 'doc';
  };
}) => {
  const explorerKey = EXPLORER_KEY.migrationFavorites;
  return favorite.type === 'doc' ? (
    <ExplorerDocNode
      key={favorite.id}
      docId={favorite.id}
      location={childLocation}
      reorderable={false}
      canDrop={false}
      explorerKey={explorerKey}
    />
  ) : (
    <ExplorerCollectionNode
      key={favorite.id}
      collectionId={favorite.id}
      location={childLocation}
      reorderable={false}
      canDrop={false}
      explorerKey={explorerKey}
    />
  );
};
