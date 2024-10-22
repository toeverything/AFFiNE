import {
  DropIndicator,
  IconButton,
  Menu,
  Tooltip,
  useDraggable,
  useDropTarget,
} from '@affine/component';
import type { AffineDNDData } from '@affine/core/types/dnd';
import { useI18n } from '@affine/i18n';
import { MoreHorizontalIcon } from '@blocksuite/icons/rc';
import {
  type DocCustomPropertyInfo,
  DocsService,
  useLiveData,
  useService,
  WorkspaceService,
} from '@toeverything/infra';
import clsx from 'clsx';
import { type HTMLProps, useCallback, useState } from 'react';

import { DocPropertyIcon } from '../icons/doc-property-icon';
import { EditDocPropertyMenuItems } from '../menu/edit-doc-property';
import {
  DocPropertyTypes,
  isSupportedDocPropertyType,
} from '../types/constant';
import * as styles from './styles.css';

const PropertyItem = ({
  propertyInfo,
  defaultOpenEditMenu,
}: {
  propertyInfo: DocCustomPropertyInfo;
  defaultOpenEditMenu?: boolean;
}) => {
  const t = useI18n();
  const workspaceService = useService(WorkspaceService);
  const docsService = useService(DocsService);
  const [moreMenuOpen, setMoreMenuOpen] = useState(defaultOpenEditMenu);

  const typeInfo = isSupportedDocPropertyType(propertyInfo.type)
    ? DocPropertyTypes[propertyInfo.type]
    : undefined;

  const handleClick = useCallback(() => {
    setMoreMenuOpen(true);
  }, []);

  const { dragRef } = useDraggable<AffineDNDData>(
    () => ({
      data: {
        entity: {
          type: 'custom-property',
          id: propertyInfo.id,
        },
        from: {
          at: 'doc-property:manager',
          workspaceId: workspaceService.workspace.id,
        },
      },
    }),
    [propertyInfo, workspaceService]
  );

  const { dropTargetRef, closestEdge } = useDropTarget<AffineDNDData>(
    () => ({
      canDrop(data) {
        return (
          data.source.data.entity?.type === 'custom-property' &&
          data.source.data.from?.at === 'doc-property:manager' &&
          data.source.data.from?.workspaceId ===
            workspaceService.workspace.id &&
          data.source.data.entity.id !== propertyInfo.id
        );
      },
      closestEdge: {
        allowedEdges: ['top', 'bottom'],
      },
      isSticky: true,
      onDrop(data) {
        if (data.source.data.entity?.type !== 'custom-property') {
          return;
        }
        const propertyId = data.source.data.entity.id;
        const edge = data.closestEdge;
        if (edge !== 'bottom' && edge !== 'top') {
          return;
        }
        docsService.propertyList.updatePropertyInfo(propertyId, {
          index: docsService.propertyList.indexAt(
            edge === 'bottom' ? 'after' : 'before',
            propertyInfo.id
          ),
        });
      },
    }),
    [docsService, propertyInfo, workspaceService]
  );

  return (
    <Tooltip content={t.t(typeInfo?.description || propertyInfo.type)}>
      <div
        className={styles.itemContainer}
        ref={elem => {
          dropTargetRef.current = elem;
          dragRef.current = elem;
        }}
        onClick={handleClick}
        data-testid="doc-property-manager-item"
      >
        <DocPropertyIcon
          className={styles.itemIcon}
          propertyInfo={propertyInfo}
        />
        <span className={styles.itemName}>
          {propertyInfo.name ||
            (typeInfo?.name ? t.t(typeInfo.name) : t['unnamed']())}
        </span>
        <span className={styles.itemVisibility}>
          {propertyInfo.show === 'hide-when-empty'
            ? t['com.affine.page-properties.property.hide-when-empty']()
            : propertyInfo.show === 'always-hide'
              ? t['com.affine.page-properties.property.always-hide']()
              : t['com.affine.page-properties.property.always-show']()}
        </span>
        <Menu
          rootOptions={{
            open: moreMenuOpen,
            onOpenChange: setMoreMenuOpen,
            modal: true,
          }}
          items={<EditDocPropertyMenuItems propertyId={propertyInfo.id} />}
        >
          <IconButton size={20} iconClassName={styles.itemMore}>
            <MoreHorizontalIcon />
          </IconButton>
        </Menu>
        <DropIndicator edge={closestEdge} noTerminal />
      </div>
    </Tooltip>
  );
};

export const DocPropertyManager = ({
  className,
  defaultOpenEditMenuPropertyId,
  ...props
}: HTMLProps<HTMLDivElement> & { defaultOpenEditMenuPropertyId?: string }) => {
  const docsService = useService(DocsService);

  const properties = useLiveData(docsService.propertyList.sortedProperties$);

  return (
    <div className={clsx(styles.container, className)} {...props}>
      {properties.map(propertyInfo => (
        <PropertyItem
          propertyInfo={propertyInfo}
          defaultOpenEditMenu={
            defaultOpenEditMenuPropertyId === propertyInfo.id
          }
          key={propertyInfo.id}
        />
      ))}
    </div>
  );
};
