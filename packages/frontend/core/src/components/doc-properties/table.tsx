import {
  Button,
  IconButton,
  Menu,
  MenuItem,
  PropertyCollapsible,
  PropertyName,
  PropertyRoot,
  Tooltip,
  useDraggable,
  useDropTarget,
} from '@affine/component';
import { DocLinksService } from '@affine/core/modules/doc-link';
import { EditorSettingService } from '@affine/core/modules/editor-settting';
import { WorkbenchService } from '@affine/core/modules/workbench';
import { ViewService } from '@affine/core/modules/workbench/services/view';
import type { AffineDNDData } from '@affine/core/types/dnd';
import { i18nTime, useI18n } from '@affine/i18n';
import { track } from '@affine/track';
import { PlusIcon, PropertyIcon, ToggleExpandIcon } from '@blocksuite/icons/rc';
import * as Collapsible from '@radix-ui/react-collapsible';
import {
  type DocCustomPropertyInfo,
  DocService,
  DocsService,
  useLiveData,
  useService,
  useServices,
  WorkspaceService,
} from '@toeverything/infra';
import clsx from 'clsx';
import { useDebouncedValue } from 'foxact/use-debounced-value';
import type React from 'react';
import type { HTMLProps, PropsWithChildren } from 'react';
import { forwardRef, useCallback, useMemo, useState } from 'react';

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

// backlinks - #no                Updated yyyy-mm-dd
// ─────────────────────────────────────────────────
// Page Info ...
export const DocPropertiesTableHeader = ({
  className,
  style,
  open,
  onOpenChange,
}: DocPropertiesTableHeaderProps) => {
  const t = useI18n();
  const {
    docLinksService,
    docService,
    workspaceService,
    editorSettingService,
  } = useServices({
    DocLinksService,
    DocService,
    WorkspaceService,
    EditorSettingService,
  });
  const docBacklinks = docLinksService.backlinks;
  const backlinks = useMemo(
    () => docBacklinks.backlinks$.value,
    [docBacklinks]
  );

  const displayDocInfo = useLiveData(
    editorSettingService.editorSetting.settings$.selector(s => s.displayDocInfo)
  );

  const { syncing, retrying, serverClock } = useLiveData(
    workspaceService.workspace.engine.doc.docState$(docService.doc.id)
  );

  const { createDate, updatedDate } = useLiveData(
    docService.doc.meta$.selector(m => ({
      createDate: m.createDate,
      updatedDate: m.updatedDate,
    }))
  );

  const timestampElement = useMemo(() => {
    const localizedCreateTime = createDate ? i18nTime(createDate) : null;

    const createTimeElement = (
      <div className={styles.tableHeaderTimestamp}>
        {t['Created']()} {localizedCreateTime}
      </div>
    );

    return serverClock ? (
      <Tooltip
        side="right"
        content={
          <>
            <div className={styles.tableHeaderTimestamp}>
              {t['Updated']()} {i18nTime(serverClock)}
            </div>
            {createDate && (
              <div className={styles.tableHeaderTimestamp}>
                {t['Created']()} {i18nTime(createDate)}
              </div>
            )}
          </>
        }
      >
        <div className={styles.tableHeaderTimestamp}>
          {!syncing && !retrying ? (
            <>
              {t['Updated']()}{' '}
              {i18nTime(serverClock, {
                relative: {
                  max: [1, 'day'],
                  accuracy: 'minute',
                },
                absolute: {
                  accuracy: 'day',
                },
              })}
            </>
          ) : (
            <>{t['com.affine.syncing']()}</>
          )}
        </div>
      </Tooltip>
    ) : updatedDate ? (
      <Tooltip side="right" content={createTimeElement}>
        <div className={styles.tableHeaderTimestamp}>
          {t['Updated']()} {i18nTime(updatedDate)}
        </div>
      </Tooltip>
    ) : (
      createTimeElement
    );
  }, [createDate, updatedDate, retrying, serverClock, syncing, t]);

  const dTimestampElement = useDebouncedValue(timestampElement, 500);

  const handleCollapse = useCallback(() => {
    track.doc.inlineDocInfo.$.toggle();
    onOpenChange(!open);
  }, [onOpenChange, open]);

  return (
    <div className={clsx(styles.tableHeader, className)} style={style}>
      {/* TODO(@Peng): add click handler to backlinks */}
      <div className={styles.tableHeaderInfoRow}>
        {backlinks.length > 0 ? (
          <DocBacklinksPopup backlinks={backlinks}>
            <div className={styles.tableHeaderBacklinksHint}>
              {t['com.affine.page-properties.backlinks']()} · {backlinks.length}
            </div>
          </DocBacklinksPopup>
        ) : null}
        {dTimestampElement}
      </div>
      <div className={styles.tableHeaderDivider} />
      {displayDocInfo ? (
        <div className={styles.tableHeaderSecondaryRow}>
          <div className={clsx(!open ? styles.pageInfoDimmed : null)}>
            {t['com.affine.page-properties.page-info']()}
          </div>
          <Collapsible.Trigger asChild role="button" onClick={handleCollapse}>
            <div
              className={styles.tableHeaderCollapseButtonWrapper}
              data-testid="page-info-collapse"
            >
              <IconButton size="20">
                <ToggleExpandIcon
                  className={styles.collapsedIcon}
                  data-collapsed={!open}
                />
              </IconButton>
            </div>
          </Collapsible.Trigger>
        </div>
      ) : null}
    </div>
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
  const viewService = useService(ViewService);
  const properties = useLiveData(docsService.propertyList.sortedProperties$);
  const [propertyCollapsed, setPropertyCollapsed] = useState(true);

  const [newPropertyId, setNewPropertyId] = useState<string | null>(null);

  return (
    <div
      ref={ref}
      className={clsx(styles.tableBodyRoot, className)}
      style={style}
      {...props}
    >
      <PropertyCollapsible
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
            >
              {t['com.affine.page-properties.add-property']()}
            </Button>
          </Menu>
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
        </div>
      </PropertyCollapsible>
      <div className={styles.tableHeaderDivider} />
    </div>
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
        <Collapsible.Content asChild>
          <DocPropertiesTableBody />
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
