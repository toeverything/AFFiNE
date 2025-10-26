import { IconButton, useConfirmModal } from '@affine/component';
import { DocsService } from '@affine/core/modules/doc';
import { MigrationFavoriteItemsAdapter } from '@affine/core/modules/favorite';
import { Trans, useI18n } from '@affine/i18n';
import { track } from '@affine/track';
import { BroomIcon, HelpIcon } from '@blocksuite/icons/rc';
import { useLiveData, useServices } from '@toeverything/infra';
import { useCallback, useMemo } from 'react';

import { CollapsibleSection } from '../../layouts/collapsible-section';
import { NavigationPanelCollectionNode } from '../../nodes/collection';
import { NavigationPanelDocNode } from '../../nodes/doc';
import { NavigationPanelTreeRoot } from '../../tree';
import * as styles from './styles.css';

export const NavigationPanelMigrationFavorites = () => {
  const t = useI18n();

  const { migrationFavoriteItemsAdapter, docsService } = useServices({
    MigrationFavoriteItemsAdapter,
    DocsService,
  });

  const docs = useLiveData(docsService.list.docs$);
  const trashDocs = useLiveData(docsService.list.trashDocs$);
  const migrated = useLiveData(migrationFavoriteItemsAdapter.migrated$);
  const { openConfirmModal } = useConfirmModal();
  const path = useMemo(() => ['migration-favorites'], []);

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
      path={path}
      className={styles.container}
      title={t['com.affine.rootAppSidebar.migration-data']()}
      actions={
        <>
          <IconButton
            data-testid="navigation-panel-bar-favorite-migration-clear-button"
            onClick={handleClickClear}
            size="16"
          >
            <BroomIcon />
          </IconButton>
          <IconButton
            data-testid="navigation-panel-bar-favorite-migration-help-button"
            size="16"
            onClick={handleClickHelp}
          >
            <HelpIcon />
          </IconButton>
        </>
      }
    >
      <NavigationPanelTreeRoot>
        {favorites.map((favorite, i) => (
          <NavigationPanelMigrationFavoriteNode
            key={favorite.id + ':' + i}
            favorite={favorite}
            parentPath={path}
          />
        ))}
      </NavigationPanelTreeRoot>
    </CollapsibleSection>
  );
};

const childLocation = {
  at: 'navigation-panel:migration-data:list' as const,
};
const NavigationPanelMigrationFavoriteNode = ({
  favorite,
  parentPath,
}: {
  favorite: {
    id: string;
    type: 'collection' | 'doc';
  };
  parentPath: string[];
}) => {
  return favorite.type === 'doc' ? (
    <NavigationPanelDocNode
      key={favorite.id}
      docId={favorite.id}
      location={childLocation}
      reorderable={false}
      canDrop={false}
      parentPath={parentPath}
    />
  ) : (
    <NavigationPanelCollectionNode
      key={favorite.id}
      collectionId={favorite.id}
      location={childLocation}
      reorderable={false}
      canDrop={false}
      parentPath={parentPath}
    />
  );
};
