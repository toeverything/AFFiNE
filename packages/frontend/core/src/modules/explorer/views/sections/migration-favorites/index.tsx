import { IconButton, useConfirmModal } from '@affine/component';
import { mixpanel } from '@affine/core/mixpanel';
import { ExplorerTreeRoot } from '@affine/core/modules/explorer/views/tree';
import { FavoriteItemsAdapter } from '@affine/core/modules/properties';
import { Trans, useI18n } from '@affine/i18n';
import { BroomIcon, HelpIcon } from '@blocksuite/icons/rc';
import { DocsService, useLiveData, useServices } from '@toeverything/infra';
import { useCallback } from 'react';

import { CollapsibleSection } from '../../layouts/collapsible-section';
import { ExplorerCollectionNode } from '../../nodes/collection';
import { ExplorerDocNode } from '../../nodes/doc';
import * as styles from './styles.css';

export const ExplorerMigrationFavorites = () => {
  const t = useI18n();

  const { favoriteItemsAdapter, docsService } = useServices({
    FavoriteItemsAdapter,
    DocsService,
  });

  const docs = useLiveData(docsService.list.docs$);
  const trashDocs = useLiveData(docsService.list.trashDocs$);
  const { openConfirmModal } = useConfirmModal();

  const favorites = useLiveData(
    favoriteItemsAdapter.orderedFavorites$.map(favs => {
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
        type: 'primary',
      },
      cancelText:
        t['com.affine.rootAppSidebar.migration-data.clean-all.cancel'](),
      onConfirm() {
        favoriteItemsAdapter.clearAll();
        mixpanel.track('AllMigrationDataCleared', {
          page: 'sidebar',
          module: 'migration data',
          control: 'clear button',
        });
      },
    });
    mixpanel.track('ClickClearMigrationDataButton', {
      page: 'sidebar',
      module: 'migration data',
      control: 'clear button',
    });
  }, [favoriteItemsAdapter, openConfirmModal, t]);

  const handleClickHelp = useCallback(() => {
    openConfirmModal({
      title: t['com.affine.rootAppSidebar.migration-data.help'](),
      description:
        t['com.affine.rootAppSidebar.migration-data.help.description'](),
      confirmText: t['com.affine.rootAppSidebar.migration-data.help.confirm'](),
      confirmButtonOptions: {
        type: 'primary',
      },
      cancelText:
        t['com.affine.rootAppSidebar.migration-data.help.clean-all'](),
      cancelButtonOptions: {
        icon: <BroomIcon />,
        type: 'default',
        onClick: () => {
          requestAnimationFrame(() => {
            handleClickClear();
          });
        },
      },
    });
    mixpanel.track('OpenMigrationDataHelp', {
      page: 'sidebar',
      module: 'migration data',
      control: 'help button',
    });
  }, [handleClickClear, openConfirmModal, t]);

  if (favorites.length === 0) {
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
            size="small"
          >
            <BroomIcon />
          </IconButton>
          <IconButton
            data-testid="explorer-bar-favorite-migration-help-button"
            size="small"
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
  return favorite.type === 'doc' ? (
    <ExplorerDocNode
      key={favorite.id}
      docId={favorite.id}
      location={childLocation}
      reorderable={false}
      canDrop={false}
    />
  ) : (
    <ExplorerCollectionNode
      key={favorite.id}
      collectionId={favorite.id}
      location={childLocation}
      reorderable={false}
      canDrop={false}
    />
  );
};
