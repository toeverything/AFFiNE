import {
  Button,
  Menu,
  PropertyCollapsibleContent,
  PropertyCollapsibleSection,
  PropertyName,
  PropertyRoot,
  useDraggable,
  useDropTarget,
} from '@affine/component';
import type { DocCustomPropertyInfo } from '@affine/core/modules/db';
import { DocService, DocsService } from '@affine/core/modules/doc';
import { DocDatabaseBacklinkInfo } from '@affine/core/modules/doc-info';
import type {
  DatabaseRow,
  DatabaseValueCell,
} from '@affine/core/modules/doc-info/types';
import { DocIntegrationPropertiesTable } from '@affine/core/modules/integration';
import { ViewService, WorkbenchService } from '@affine/core/modules/workbench';
import type { AffineDNDData } from '@affine/core/types/dnd';
import { useI18n } from '@affine/i18n';
import { track } from '@affine/track';
import { PlusIcon, PropertyIcon, ToggleDownIcon } from '@blocksuite/icons/rc';
import * as Collapsible from '@radix-ui/react-collapsible';
import {
  useLiveData,
  useService,
  useServiceOptional,
} from '@toeverything/infra';
import clsx from 'clsx';
import type React from 'react';
import { forwardRef, useCallback, useMemo, useState } from 'react';

import { useGuard } from '../guard';
import { DocPropertyIcon } from './icons/doc-property-icon';
import { CreatePropertyMenuItems } from './menu/create-doc-property';
import { EditDocPropertyMenuItems } from './menu/edit-doc-property';
import * as styles from './table.css';
import { DocPropertyTypes, isSupportedDocPropertyType } from './types/constant';

export type DefaultOpenProperty =
  | {
      type: 'workspace';
    }
  | {
      type: 'database';
      docId: string;
      databaseId: string;
      databaseRowId: string;
    };

export interface DocPropertiesTableProps {
  className?: string;
  defaultOpenProperty?: DefaultOpenProperty;
  onPropertyAdded?: (property: DocCustomPropertyInfo) => void;
  onPropertyChange?: (property: DocCustomPropertyInfo, value: unknown) => void;
  onPropertyInfoChange?: (
    property: DocCustomPropertyInfo,
    field: keyof DocCustomPropertyInfo,
    value: string
  ) => void;
  onDatabasePropertyChange?: (
    row: DatabaseRow,
    cell: DatabaseValueCell,
    value: unknown
  ) => void;
}

interface DocPropertiesTableHeaderProps {
  className?: string;
  style?: React.CSSProperties;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Info
// ─────────────────────────────────────────────────
export const DocPropertiesTableHeader = ({
  className,
  style,
  open,
  onOpenChange,
}: DocPropertiesTableHeaderProps) => {
  const handleCollapse = useCallback(() => {
    track.doc.inlineDocInfo.$.toggle();
    onOpenChange(!open);
  }, [onOpenChange, open]);
  const t = useI18n();
  return (
    <Collapsible.Trigger style={style} role="button" onClick={handleCollapse}>
      <div className={clsx(styles.tableHeader, className)}>
        <div className={clsx(!open ? styles.pageInfoDimmed : null)}>
          {t['com.affine.page-properties.page-info']()}
        </div>
        <div
          className={styles.tableHeaderCollapseButtonWrapper}
          data-testid="page-info-collapse"
        >
          <ToggleDownIcon
            className={styles.collapsedIcon}
            data-collapsed={!open}
          />
        </div>
      </div>

      <div className={styles.tableHeaderDivider} />
    </Collapsible.Trigger>
  );
};

interface DocPropertyRowProps {
  propertyInfo: DocCustomPropertyInfo;
  showAll?: boolean;
  defaultOpenEditMenu?: boolean;
  propertyInfoReadonly?: boolean;
  readonly?: boolean;
  onChange?: (value: unknown) => void;
  onPropertyInfoChange?: (
    field: keyof DocCustomPropertyInfo,
    value: string
  ) => void;
}

export const DocPropertyRow = ({
  propertyInfo,
  defaultOpenEditMenu,
  onChange,
  propertyInfoReadonly,
  readonly,
  onPropertyInfoChange,
}: DocPropertyRowProps) => {
  const t = useI18n();
  const docService = useService(DocService);
  const docsService = useService(DocsService);
  const customPropertyValue = useLiveData(
    docService.doc.customProperty$(propertyInfo.id)
  );

  const typeInfo = isSupportedDocPropertyType(propertyInfo.type)
    ? DocPropertyTypes[propertyInfo.type]
    : undefined;

  const hide = propertyInfo.show === 'always-hide';
  const hideEmpty = propertyInfo.show === 'hide-when-empty';

  const ValueRenderer =
    typeInfo && 'value' in typeInfo ? typeInfo.value : undefined;

  const handleChange = useCallback(
    (value: any, skipCommit?: boolean) => {
      if (!skipCommit) {
        if (typeof value !== 'string') {
          throw new Error('only allow string value');
        }
        docService.doc.record.setCustomProperty(propertyInfo.id, value);
      }
      onChange?.(value);
    },
    [docService, onChange, propertyInfo]
  );

  const docId = docService.doc.id;
  const { dragRef } = useDraggable<AffineDNDData>(
    () => ({
      canDrag: !propertyInfoReadonly,
      data: {
        entity: {
          type: 'custom-property',
          id: propertyInfo.id,
        },
        from: {
          at: 'doc-property:table',
          docId: docId,
        },
      },
    }),
    [docId, propertyInfo.id, propertyInfoReadonly]
  );
  const { dropTargetRef, closestEdge } = useDropTarget<AffineDNDData>(
    () => ({
      closestEdge: {
        allowedEdges: ['bottom', 'top'],
      },
      canDrop: data => {
        return (
          !propertyInfoReadonly &&
          data.source.data.entity?.type === 'custom-property' &&
          data.source.data.entity.id !== propertyInfo.id &&
          data.source.data.from?.at === 'doc-property:table' &&
          data.source.data.from?.docId === docId
        );
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
    [docId, docsService.propertyList, propertyInfo.id, propertyInfoReadonly]
  );

  if (!ValueRenderer || typeof ValueRenderer !== 'function') return null;

  return (
    <PropertyRoot
      ref={el => {
        dragRef.current = el;
        dropTargetRef.current = el;
      }}
      dropIndicatorEdge={closestEdge}
      hideEmpty={hideEmpty}
      hide={hide}
      data-property-info-readonly={propertyInfoReadonly}
      data-readonly={readonly}
      data-testid="doc-property-row"
      data-info-id={propertyInfo.id}
    >
      <PropertyName
        defaultOpenMenu={defaultOpenEditMenu}
        icon={<DocPropertyIcon propertyInfo={propertyInfo} />}
        name={
          propertyInfo.name ||
          (typeInfo?.name ? t.t(typeInfo.name) : t['unnamed']())
        }
        menuItems={
          <EditDocPropertyMenuItems
            propertyId={propertyInfo.id}
            onPropertyInfoChange={onPropertyInfoChange}
            readonly={propertyInfoReadonly}
          />
        }
        data-testid="doc-property-name"
      />
      <ValueRenderer
        propertyInfo={propertyInfo}
        onChange={handleChange}
        value={customPropertyValue}
        readonly={readonly}
      />
    </PropertyRoot>
  );
};

interface DocWorkspacePropertiesTableBodyProps {
  className?: string;
  style?: React.CSSProperties;
  defaultOpen?: boolean;
  onChange?: (property: DocCustomPropertyInfo, value: unknown) => void;
  onPropertyAdded?: (property: DocCustomPropertyInfo) => void;
  onPropertyInfoChange?: (
    property: DocCustomPropertyInfo,
    field: keyof DocCustomPropertyInfo,
    value: string
  ) => void;
}

// 🏷️ Tags     (⋅ xxx) (⋅ yyy)
// #️⃣ Number   123456
// +  Add a property
const DocWorkspacePropertiesTableBody = forwardRef<
  HTMLDivElement,
  DocWorkspacePropertiesTableBodyProps
>(
  (
    {
      className,
      style,
      defaultOpen,
      onChange,
      onPropertyAdded,
      onPropertyInfoChange,
      ...props
    },
    ref
  ) => {
    const t = useI18n();
    const docsService = useService(DocsService);
    const workbenchService = useService(WorkbenchService);
    const viewService = useServiceOptional(ViewService);
    const docService = useService(DocService);
    const properties = useLiveData(docsService.propertyList.sortedProperties$);
    const [addMoreCollapsed, setAddMoreCollapsed] = useState(true);

    const [newPropertyId, setNewPropertyId] = useState<string | null>(null);

    const canEditProperty = useGuard('Doc_Update', docService.doc.id);
    const canEditPropertyInfo = useGuard('Workspace_Properties_Update');

    const handlePropertyAdded = useCallback(
      (property: DocCustomPropertyInfo) => {
        setNewPropertyId(property.id);
        onPropertyAdded?.(property);
      },
      [onPropertyAdded]
    );

    const handleCollapseChange = useCallback(() => {
      setNewPropertyId(null);
    }, []);

    return (
      <PropertyCollapsibleSection
        ref={ref}
        className={clsx(styles.tableBodyRoot, className)}
        style={style}
        title={t.t('com.affine.workspace.properties')}
        defaultCollapsed={!defaultOpen}
        onCollapseChange={handleCollapseChange}
        {...props}
      >
        <PropertyCollapsibleContent
          collapsible
          collapsed={addMoreCollapsed}
          onCollapseChange={setAddMoreCollapsed}
          className={styles.tableBodySortable}
          collapseButtonText={({ hide, isCollapsed }) =>
            isCollapsed
              ? hide === 1
                ? t['com.affine.page-properties.more-property.one']({
                    count: hide.toString(),
                  })
                : t['com.affine.page-properties.more-property.more']({
                    count: hide.toString(),
                  })
              : hide === 1
                ? t['com.affine.page-properties.hide-property.one']({
                    count: hide.toString(),
                  })
                : t['com.affine.page-properties.hide-property.more']({
                    count: hide.toString(),
                  })
          }
        >
          {properties.map(property => (
            <DocPropertyRow
              key={property.id}
              propertyInfo={property}
              defaultOpenEditMenu={newPropertyId === property.id}
              onChange={value => onChange?.(property, value)}
              readonly={!canEditProperty}
              propertyInfoReadonly={!canEditPropertyInfo}
              onPropertyInfoChange={(...args) =>
                onPropertyInfoChange?.(property, ...args)
              }
            />
          ))}
          <div className={styles.actionContainer}>
            {!canEditPropertyInfo ? (
              <Button
                variant="plain"
                prefix={<PlusIcon />}
                className={styles.propertyActionButton}
                data-testid="add-property-button"
                disabled={!canEditPropertyInfo}
              >
                {t['com.affine.page-properties.add-property']()}
              </Button>
            ) : (
              <Menu
                items={
                  <CreatePropertyMenuItems
                    at="after"
                    onCreated={handlePropertyAdded}
                  />
                }
                contentOptions={{
                  onClick(e) {
                    e.stopPropagation();
                  },
                }}
              >
                <Button
                  variant="plain"
                  prefix={<PlusIcon />}
                  className={styles.propertyActionButton}
                  data-testid="add-property-button"
                >
                  {t['com.affine.page-properties.add-property']()}
                </Button>
              </Menu>
            )}
            {viewService ? (
              <Button
                variant="plain"
                prefix={<PropertyIcon />}
                className={clsx(
                  styles.propertyActionButton,
                  styles.propertyConfigButton
                )}
                onClick={() => {
                  viewService.view.activeSidebarTab('properties');
                  workbenchService.workbench.openSidebar();
                }}
              >
                {t['com.affine.page-properties.config-properties']()}
              </Button>
            ) : null}
          </div>
        </PropertyCollapsibleContent>
      </PropertyCollapsibleSection>
    );
  }
);
DocWorkspacePropertiesTableBody.displayName = 'PagePropertiesTableBody';

const DocPropertiesTableInner = ({
  defaultOpenProperty,
  onPropertyAdded,
  onPropertyChange,
  onPropertyInfoChange,
  onDatabasePropertyChange,
  className,
}: DocPropertiesTableProps) => {
  const [expanded, setExpanded] = useState(!!defaultOpenProperty);
  const defaultOpen = useMemo(() => {
    return defaultOpenProperty?.type === 'database'
      ? [
          {
            databaseBlockId: defaultOpenProperty.databaseId,
            rowId: defaultOpenProperty.databaseRowId,
            docId: defaultOpenProperty.docId,
          },
        ]
      : [];
  }, [defaultOpenProperty]);
  return (
    <div className={clsx(styles.root, className)}>
      <Collapsible.Root open={expanded} onOpenChange={setExpanded}>
        <DocPropertiesTableHeader
          style={{ width: '100%' }}
          open={expanded}
          onOpenChange={setExpanded}
        />
        <Collapsible.Content>
          <DocIntegrationPropertiesTable
            divider={<div className={styles.tableHeaderDivider} />}
          />
          <DocWorkspacePropertiesTableBody
            defaultOpen={
              !defaultOpenProperty || defaultOpenProperty.type === 'workspace'
            }
            onPropertyAdded={onPropertyAdded}
            onChange={onPropertyChange}
            onPropertyInfoChange={onPropertyInfoChange}
          />
          <div className={styles.tableHeaderDivider} />
          <DocDatabaseBacklinkInfo
            onChange={onDatabasePropertyChange}
            defaultOpen={defaultOpen}
          />
        </Collapsible.Content>
      </Collapsible.Root>
    </div>
  );
};

// this is the main component that renders the page properties table at the top of the page below
// the page title
export const DocPropertiesTable = (props: DocPropertiesTableProps) => {
  return <DocPropertiesTableInner {...props} />;
};
