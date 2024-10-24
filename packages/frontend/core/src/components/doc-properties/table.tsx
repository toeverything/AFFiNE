import {
  Button,
  Menu,
  MenuItem,
  PropertyCollapsibleContent,
  PropertyCollapsibleSection,
  PropertyName,
  PropertyRoot,
  useDraggable,
  useDropTarget,
} from '@affine/component';
import { DocDatabaseBacklinkInfo } from '@affine/core/modules/doc-info';
import { WorkbenchService } from '@affine/core/modules/workbench';
import { ViewService } from '@affine/core/modules/workbench/services/view';
import type { AffineDNDData } from '@affine/core/types/dnd';
import { useI18n } from '@affine/i18n';
import { track } from '@affine/track';
import { PlusIcon, PropertyIcon, ToggleExpandIcon } from '@blocksuite/icons/rc';
import * as Collapsible from '@radix-ui/react-collapsible';
import {
  type DocCustomPropertyInfo,
  DocService,
  DocsService,
  useLiveData,
  useService,
  useServiceOptional,
} from '@toeverything/infra';
import clsx from 'clsx';
import type React from 'react';
import type { HTMLProps, PropsWithChildren } from 'react';
import { forwardRef, useCallback, useState } from 'react';

import { AffinePageReference } from '../affine/reference-link';
import { DocPropertyIcon } from './icons/doc-property-icon';
import { CreatePropertyMenuItems } from './menu/create-doc-property';
import { EditDocPropertyMenuItems } from './menu/edit-doc-property';
import * as styles from './table.css';
import { DocPropertyTypes, isSupportedDocPropertyType } from './types/constant';

type DocBacklinksPopupProps = PropsWithChildren<{
  backlinks: { docId: string; blockId: string; title: string }[];
}>;

export const DocBacklinksPopup = ({
  backlinks,
  children,
}: DocBacklinksPopupProps) => {
  return (
    <Menu
      contentOptions={{
        className: styles.backLinksMenu,
        onClick(e) {
          e.stopPropagation();
        },
      }}
      items={
        <div className={styles.backlinksList}>
          {backlinks.map(link => (
            <AffinePageReference
              key={link.docId + ':' + link.blockId}
              wrapper={MenuItem}
              pageId={link.docId}
            />
          ))}
        </div>
      }
    >
      {children}
    </Menu>
  );
};

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
          <ToggleExpandIcon
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
}

export const DocPropertyRow = ({
  propertyInfo,
  defaultOpenEditMenu,
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
    (value: any) => {
      if (typeof value !== 'string') {
        throw new Error('only allow string value');
      }
      docService.doc.record.setCustomProperty(propertyInfo.id, value);
    },
    [docService, propertyInfo]
  );

  const docId = docService.doc.id;
  const { dragRef } = useDraggable<AffineDNDData>(
    () => ({
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
    [docId, propertyInfo.id]
  );
  const { dropTargetRef, closestEdge } = useDropTarget<AffineDNDData>(
    () => ({
      closestEdge: {
        allowedEdges: ['bottom', 'top'],
      },
      canDrop: data => {
        return (
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
    [docId, docsService.propertyList, propertyInfo.id]
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
        menuItems={<EditDocPropertyMenuItems propertyId={propertyInfo.id} />}
        data-testid="doc-property-name"
      />
      <ValueRenderer
        propertyInfo={propertyInfo}
        onChange={handleChange}
        value={customPropertyValue}
      />
    </PropertyRoot>
  );
};

interface DocPropertiesTableBodyProps {
  className?: string;
  style?: React.CSSProperties;
}

// 🏷️ Tags     (⋅ xxx) (⋅ yyy)
// #️⃣ Number   123456
// +  Add a property
export const DocPropertiesTableBody = forwardRef<
  HTMLDivElement,
  DocPropertiesTableBodyProps & HTMLProps<HTMLDivElement>
>(({ className, style, ...props }, ref) => {
  const t = useI18n();
  const docsService = useService(DocsService);
  const workbenchService = useService(WorkbenchService);
  const viewService = useServiceOptional(ViewService);
  const properties = useLiveData(docsService.propertyList.sortedProperties$);
  const [propertyCollapsed, setPropertyCollapsed] = useState(true);

  const [newPropertyId, setNewPropertyId] = useState<string | null>(null);

  return (
    <PropertyCollapsibleSection
      ref={ref}
      className={clsx(styles.tableBodyRoot, className)}
      style={style}
      title={t.t('com.affine.workspace.properties')}
      {...props}
    >
      <PropertyCollapsibleContent
        collapsible
        collapsed={propertyCollapsed}
        onCollapseChange={setPropertyCollapsed}
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
          />
        ))}
        <div className={styles.actionContainer}>
          <Menu
            items={
              <CreatePropertyMenuItems
                at="after"
                onCreated={setNewPropertyId}
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
});
DocPropertiesTableBody.displayName = 'PagePropertiesTableBody';

const DocPropertiesTableInner = () => {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={styles.root}>
      <Collapsible.Root
        open={expanded}
        onOpenChange={setExpanded}
        className={styles.rootCentered}
      >
        <DocPropertiesTableHeader open={expanded} onOpenChange={setExpanded} />
        <Collapsible.Content>
          <DocPropertiesTableBody />
          <div className={styles.tableHeaderDivider} />
          <DocDatabaseBacklinkInfo />
        </Collapsible.Content>
      </Collapsible.Root>
    </div>
  );
};

// this is the main component that renders the page properties table at the top of the page below
// the page title
export const DocPropertiesTable = () => {
  return <DocPropertiesTableInner />;
};
