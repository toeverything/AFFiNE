import {
  DropIndicator,
  IconButton,
  Menu,
  Tooltip,
  useDraggable,
  useDropTarget,
} from '@affine/component';
import type { DocCustomPropertyInfo } from '@affine/core/modules/db';
import { WorkspaceService } from '@affine/core/modules/workspace';
import { WorkspacePropertyService } from '@affine/core/modules/workspace-property';
import type { AffineDNDData } from '@affine/core/types/dnd';
import { useI18n } from '@affine/i18n';
import { MoreHorizontalIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import clsx from 'clsx';
import { type HTMLProps, useCallback, useState } from 'react';

import { useGuard } from '../../guard';
import {
  isSupportedWorkspacePropertyType,
  WorkspacePropertyTypes,
} from '../../workspace-property-types';
import { WorkspacePropertyIcon } from '../icons/workspace-property-icon';
import { EditWorkspacePropertyMenuItems } from '../menu/edit-doc-property';
import * as styles from './styles.css';

const PropertyItem = ({
  propertyInfo,
  defaultOpenEditMenu,
  onPropertyInfoChange,
}: {
  propertyInfo: DocCustomPropertyInfo;
  defaultOpenEditMenu?: boolean;
  onPropertyInfoChange?: (
    field: keyof DocCustomPropertyInfo,
    value: string
  ) => void;
}) => {
  const t = useI18n();
  const workspaceService = useService(WorkspaceService);
  const workspacePropertyService = useService(WorkspacePropertyService);
  const [moreMenuOpen, setMoreMenuOpen] = useState(defaultOpenEditMenu);
  const canEditPropertyInfo = useGuard('Workspace_Properties_Update');

  const typeInfo = isSupportedWorkspacePropertyType(propertyInfo.type)
    ? WorkspacePropertyTypes[propertyInfo.type]
    : undefined;

  const handleClick = useCallback(() => {
    setMoreMenuOpen(true);
  }, []);

  const { dragRef } = useDraggable<AffineDNDData>(
    () => ({
      canDrag: canEditPropertyInfo,
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
    [propertyInfo, workspaceService, canEditPropertyInfo]
  );

  const { dropTargetRef, closestEdge } = useDropTarget<AffineDNDData>(
    () => ({
      canDrop(data) {
        return (
          !!canEditPropertyInfo &&
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
        workspacePropertyService.updatePropertyInfo(propertyId, {
          index: workspacePropertyService.indexAt(
            edge === 'bottom' ? 'after' : 'before',
            propertyInfo.id
          ),
        });
      },
    }),
    [
      workspacePropertyService,
      propertyInfo,
      workspaceService,
      canEditPropertyInfo,
    ]
  );

  return (
    <Tooltip
      content={t.t(typeInfo?.description || propertyInfo.type)}
      side="left"
    >
      <div
        className={styles.itemContainer}
        ref={elem => {
          dropTargetRef.current = elem;
          dragRef.current = elem;
        }}
        onClick={handleClick}
        data-testid="doc-property-manager-item"
      >
        <WorkspacePropertyIcon
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
          items={
            <EditWorkspacePropertyMenuItems
              propertyId={propertyInfo.id}
              onPropertyInfoChange={onPropertyInfoChange}
              readonly={!canEditPropertyInfo}
            />
          }
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

export const WorkspacePropertyManager = ({
  className,
  defaultOpenEditMenuPropertyId,
  onPropertyInfoChange,
  ...props
}: HTMLProps<HTMLDivElement> & {
  defaultOpenEditMenuPropertyId?: string;
  onPropertyInfoChange?: (
    property: DocCustomPropertyInfo,
    field: keyof DocCustomPropertyInfo,
    value: string
  ) => void;
}) => {
  const workspacePropertyService = useService(WorkspacePropertyService);

  const properties = useLiveData(workspacePropertyService.sortedProperties$);

  return (
    <div className={clsx(styles.container, className)} {...props}>
      {properties.map(propertyInfo => (
        <PropertyItem
          propertyInfo={propertyInfo}
          defaultOpenEditMenu={
            defaultOpenEditMenuPropertyId === propertyInfo.id
          }
          key={propertyInfo.id}
          onPropertyInfoChange={(...args) =>
            onPropertyInfoChange?.(propertyInfo, ...args)
          }
        />
      ))}
    </div>
  );
};
