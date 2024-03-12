import { AnimatedCollectionsIcon, toast } from '@affine/component';
import { RenameModal } from '@affine/component/rename-modal';
import { Button, IconButton } from '@affine/component/ui/button';
import {
  CollectionOperations,
  filterPage,
  stopPropagation,
} from '@affine/core/components/page-list';
import { CollectionService } from '@affine/core/modules/collection';
import type { Collection, DeleteCollectionInfo } from '@affine/env/filter';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { MoreHorizontalIcon, ViewLayersIcon } from '@blocksuite/icons';
import type { DocMeta, Workspace } from '@blocksuite/store';
import { useDroppable } from '@dnd-kit/core';
import * as Collapsible from '@radix-ui/react-collapsible';
import { useService } from '@toeverything/infra';
import { useLiveData } from '@toeverything/infra/livedata';
import { useCallback, useMemo, useState } from 'react';

import { useAllPageListConfig } from '../../../../hooks/affine/use-all-page-list-config';
import { getDropItemId } from '../../../../hooks/affine/use-sidebar-drag';
import { useBlockSuiteDocMeta } from '../../../../hooks/use-block-suite-page-meta';
import { Workbench } from '../../../../modules/workbench';
import { WorkbenchLink } from '../../../../modules/workbench/view/workbench-link';
import { MenuLinkItem as SidebarMenuLinkItem } from '../../../app-sidebar';
import type { CollectionsListProps } from '../index';
import { Page } from './page';
import * as styles from './styles.css';

const CollectionRenderer = ({
  collection,
  pages,
  workspace,
  info,
}: {
  collection: Collection;
  pages: DocMeta[];
  workspace: Workspace;
  info: DeleteCollectionInfo;
}) => {
  const [collapsed, setCollapsed] = useState(true);
  const [open, setOpen] = useState(false);
  const collectionService = useService(CollectionService);
  const t = useAFFiNEI18N();
  const dragItemId = getDropItemId('collections', collection.id);

  const removeFromAllowList = useCallback(
    (id: string) => {
      collectionService.updateCollection(collection.id, () => ({
        ...collection,
        allowList: collection.allowList?.filter(v => v !== id),
      }));

      toast(t['com.affine.collection.removePage.success']());
    },
    [collection, collectionService, t]
  );

  const { setNodeRef, isOver } = useDroppable({
    id: dragItemId,
    data: {
      addToCollection: (id: string) => {
        if (collection.allowList.includes(id)) {
          toast(t['com.affine.collection.addPage.alreadyExists']());
          return;
        } else {
          toast(t['com.affine.collection.addPage.success']());
        }
        collectionService.addPageToCollection(collection.id, id);
      },
    },
  });

  const config = useAllPageListConfig();
  const allPagesMeta = useMemo(
    () => Object.fromEntries(pages.map(v => [v.id, v])),
    [pages]
  );
  const allowList = useMemo(
    () => new Set(collection.allowList),
    [collection.allowList]
  );

  const pagesToRender = pages.filter(meta => {
    if (meta.trash) return false;
    const pageData = {
      meta,
      publicMode: config.getPublicMode(meta.id),
    };
    return filterPage(collection, pageData);
  });
  const location = useLiveData(useService(Workbench).location);
  const currentPath = location.pathname;
  const path = `/collection/${collection.id}`;

  const onRename = useCallback(
    (name: string) => {
      collectionService.updateCollection(collection.id, () => ({
        ...collection,
        name,
      }));
      toast(t['com.affine.toastMessage.rename']());
    },
    [collection, collectionService, t]
  );
  const handleOpen = useCallback(() => {
    setOpen(true);
  }, []);

  return (
    <Collapsible.Root open={!collapsed} ref={setNodeRef}>
      <SidebarMenuLinkItem
        data-testid="collection-item"
        data-type="collection-list-item"
        onCollapsedChange={setCollapsed}
        active={isOver || currentPath === path}
        icon={<AnimatedCollectionsIcon closed={isOver} />}
        to={path}
        linkComponent={WorkbenchLink}
        postfix={
          <div
            onClick={stopPropagation}
            style={{ display: 'flex', alignItems: 'center' }}
          >
            <CollectionOperations
              info={info}
              collection={collection}
              config={config}
              openRenameModal={handleOpen}
            >
              <IconButton
                data-testid="collection-options"
                type="plain"
                size="small"
                style={{ marginLeft: 4 }}
              >
                <MoreHorizontalIcon />
              </IconButton>
            </CollectionOperations>
            <RenameModal
              open={open}
              onOpenChange={setOpen}
              onRename={onRename}
              currentName={collection.name}
            />
          </div>
        }
        collapsed={pagesToRender.length > 0 ? collapsed : undefined}
      >
        <span>{collection.name}</span>
      </SidebarMenuLinkItem>
      <Collapsible.Content className={styles.collapsibleContent}>
        <div style={{ marginLeft: 20, marginTop: -4 }}>
          {pagesToRender.map(page => {
            return (
              <Page
                inAllowList={allowList.has(page.id)}
                removeFromAllowList={removeFromAllowList}
                allPageMeta={allPagesMeta}
                page={page}
                key={page.id}
                workspace={workspace}
              />
            );
          })}
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
};
export const CollectionsList = ({
  workspace,
  info,
  onCreate,
}: CollectionsListProps) => {
  const metas = useBlockSuiteDocMeta(workspace);
  const collections = useLiveData(useService(CollectionService).collections);
  const t = useAFFiNEI18N();
  if (collections.length === 0) {
    return (
      <div className={styles.emptyCollectionWrapper}>
        <div className={styles.emptyCollectionContent}>
          <div className={styles.emptyCollectionIconWrapper}>
            <ViewLayersIcon className={styles.emptyCollectionIcon} />
          </div>
          <div
            data-testid="slider-bar-collection-null-description"
            className={styles.emptyCollectionMessage}
          >
            {t['com.affine.collections.empty.message']()}
          </div>
        </div>
        <Button className={styles.emptyCollectionNewButton} onClick={onCreate}>
          {t['com.affine.collections.empty.new-collection-button']()}
        </Button>
      </div>
    );
  }
  return (
    <div data-testid="collections" className={styles.wrapper}>
      {collections.map(view => {
        return (
          <CollectionRenderer
            info={info}
            key={view.id}
            collection={view}
            pages={metas}
            workspace={workspace}
          />
        );
      })}
    </div>
  );
};
