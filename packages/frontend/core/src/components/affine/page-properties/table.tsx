import type { MenuProps } from '@affine/component';
import { Button, IconButton, Menu, MenuItem, Tooltip } from '@affine/component';
import { useCurrentWorkspacePropertiesAdapter } from '@affine/core/components/hooks/use-affine-adapter';
import { DocLinksService } from '@affine/core/modules/doc-link';
import { EditorSettingService } from '@affine/core/modules/editor-settting';
import type {
  PageInfoCustomProperty,
  PageInfoCustomPropertyMeta,
  PagePropertyType,
} from '@affine/core/modules/properties/services/schema';
import { i18nTime, useI18n } from '@affine/i18n';
import { track } from '@affine/track';
import { assertExists } from '@blocksuite/affine/global/utils';
import {
  ArrowDownSmallIcon,
  DeleteIcon,
  InvisibleIcon,
  MoreHorizontalIcon,
  PlusIcon,
  TagsIcon,
  ToggleExpandIcon,
  ViewIcon,
} from '@blocksuite/icons/rc';
import type { DragEndEvent, DraggableAttributes } from '@dnd-kit/core';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  restrictToParentElement,
  restrictToVerticalAxis,
} from '@dnd-kit/modifiers';
import { SortableContext, useSortable } from '@dnd-kit/sortable';
import * as Collapsible from '@radix-ui/react-collapsible';
import {
  DocService,
  useLiveData,
  useServices,
  WorkspaceService,
} from '@toeverything/infra';
import clsx from 'clsx';
import { use } from 'foxact/use';
import { useDebouncedValue } from 'foxact/use-debounced-value';
import { atom, useAtomValue, useSetAtom } from 'jotai';
import type React from 'react';
import type {
  CSSProperties,
  MouseEvent,
  MouseEventHandler,
  PropsWithChildren,
} from 'react';
import {
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { AffinePageReference } from '../reference-link';
import { managerContext } from './common';
import { ConfirmDeletePropertyModal } from './confirm-delete-property-modal';
import type { PagePropertyIcon } from './icons-mapping';
import { getDefaultIconName, nameToIcon } from './icons-mapping';
import type { MenuItemOption } from './menu-items';
import {
  EditPropertyNameMenuItem,
  PropertyTypeMenuItem,
  renderMenuItemOptions,
} from './menu-items';
import type { PagePropertiesMetaManager } from './page-properties-manager';
import {
  newPropertyTypes,
  PagePropertiesManager,
} from './page-properties-manager';
import {
  propertyValueRenderers,
  TagsValue,
} from './property-row-value-renderer';
import * as styles from './styles.css';

type PagePropertiesSettingsPopupProps = PropsWithChildren<{
  className?: string;
  style?: React.CSSProperties;
}>;

const Divider = () => <div className={styles.tableHeaderDivider} />;

type PropertyVisibility = PageInfoCustomProperty['visibility'];

const editingPropertyAtom = atom<string | null>(null);

const modifiers = [restrictToParentElement, restrictToVerticalAxis];

interface SortablePropertiesProps {
  children: (properties: PageInfoCustomProperty[]) => React.ReactNode;
}

export const SortableProperties = ({ children }: SortablePropertiesProps) => {
  const manager = useContext(managerContext);
  const properties = useMemo(() => manager.sorter.getOrderedItems(), [manager]);
  const editingItem = useAtomValue(editingPropertyAtom);
  const draggable = !manager.readonly && !editingItem;
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );
  // use localProperties since changes applied to upstream may be delayed
  // if we use that one, there will be weird behavior after reordering
  const [localProperties, setLocalProperties] = useState(properties);

  useEffect(() => {
    setLocalProperties(properties);
  }, [properties]);

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (!draggable) {
        return;
      }
      const { active, over } = event;
      if (over) {
        manager.sorter.move(active.id, over.id);
      }
      setLocalProperties(manager.sorter.getOrderedItems());
    },
    [manager, draggable]
  );

  const filteredProperties = useMemo(
    () => localProperties.filter(p => manager.getCustomPropertyMeta(p.id)),
    [localProperties, manager]
  );

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd} modifiers={modifiers}>
      <SortableContext disabled={!draggable} items={properties}>
        {children(filteredProperties)}
      </SortableContext>
    </DndContext>
  );
};

type SyntheticListenerMap = ReturnType<typeof useSortable>['listeners'];

const SortablePropertyRow = ({
  property,
  className,
  children,
  ...props
}: {
  property: PageInfoCustomProperty;
  className?: string;
  children?:
    | React.ReactNode
    | ((props: {
        attributes: DraggableAttributes;
        listeners?: SyntheticListenerMap;
      }) => React.ReactNode);
}) => {
  const manager = useContext(managerContext);
  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    active,
    isDragging,
    isSorting,
  } = useSortable({
    id: property.id,
  });
  const style: CSSProperties = useMemo(
    () => ({
      transform: transform
        ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
        : undefined,
      transition: isSorting ? transition : undefined,
      pointerEvents: manager.readonly ? 'none' : undefined,
    }),
    [isSorting, manager.readonly, transform, transition]
  );

  return (
    <div
      style={style}
      ref={setNodeRef}
      className={clsx(styles.propertyRow, className)}
      data-property={property.id}
      data-draggable={!manager.readonly}
      data-dragging={isDragging}
      data-other-dragging={active ? active.id !== property.id : false}
      {...props}
      {...attributes}
      {...listeners}
    >
      {typeof children === 'function'
        ? children({ attributes, listeners })
        : children}
    </div>
  );
};

const visibilities: PropertyVisibility[] = ['visible', 'hide', 'hide-if-empty'];
const rotateVisibility = (
  visibility: PropertyVisibility
): PropertyVisibility => {
  const index = visibilities.indexOf(visibility);
  return visibilities[(index + 1) % visibilities.length];
};

const visibilityMenuText = (visibility: PropertyVisibility = 'visible') => {
  switch (visibility) {
    case 'hide':
      return 'com.affine.page-properties.property.hide-in-view';
    case 'hide-if-empty':
      return 'com.affine.page-properties.property.hide-in-view-when-empty';
    case 'visible':
      return 'com.affine.page-properties.property.show-in-view';
    default:
      throw new Error(`unknown visibility: ${visibility}`);
  }
};

const visibilitySelectorText = (visibility: PropertyVisibility = 'visible') => {
  switch (visibility) {
    case 'hide':
      return 'com.affine.page-properties.property.always-hide';
    case 'hide-if-empty':
      return 'com.affine.page-properties.property.hide-when-empty';
    case 'visible':
      return 'com.affine.page-properties.property.always-show';
    default:
      throw new Error(`unknown visibility: ${visibility}`);
  }
};

const VisibilityModeSelector = ({
  property,
}: {
  property: PageInfoCustomProperty;
}) => {
  const manager = useContext(managerContext);
  const t = useI18n();
  const meta = manager.getCustomPropertyMeta(property.id);
  const visibility = property.visibility || 'visible';

  const menuItems = useMemo(() => {
    const options: MenuItemOption[] = [];
    options.push(
      visibilities.map(v => {
        const text = visibilityMenuText(v);
        return {
          text: t[text](),
          selected: visibility === v,
          onClick: () => {
            manager.updateCustomProperty(property.id, {
              visibility: v,
            });
          },
        };
      })
    );
    return renderMenuItemOptions(options);
  }, [manager, property.id, t, visibility]);

  if (!meta) {
    return null;
  }

  const required = meta.required;

  return (
    <Menu
      items={menuItems}
      rootOptions={{
        open: required ? false : undefined,
      }}
      contentOptions={{
        onClick(e) {
          e.stopPropagation();
        },
      }}
    >
      <div
        role="button"
        data-required={required}
        className={styles.selectorButton}
      >
        {required ? (
          t['com.affine.page-properties.property.required']()
        ) : (
          <>
            {t[visibilitySelectorText(visibility)]()}
            <ArrowDownSmallIcon width={16} height={16} />
          </>
        )}
      </div>
    </Menu>
  );
};

export const PagePropertiesSettingsPopup = ({
  children,
}: PagePropertiesSettingsPopupProps) => {
  const manager = useContext(managerContext);
  const t = useI18n();

  const menuItems = useMemo(() => {
    const options: MenuItemOption[] = [];
    options.push(
      <div
        role="heading"
        className={styles.menuHeader}
        style={{ minWidth: 320 }}
      >
        {t['com.affine.page-properties.settings.title']()}
      </div>
    );
    options.push('-');
    options.push([
      <SortableProperties key="sortable-settings">
        {properties =>
          properties.map(property => {
            const meta = manager.getCustomPropertyMeta(property.id);
            assertExists(meta, 'meta should exist for property');
            const Icon = nameToIcon(meta.icon, meta.type);
            const name = meta.name;
            return (
              <SortablePropertyRow
                key={meta.id}
                property={property}
                className={styles.propertySettingRow}
                data-testid="page-properties-settings-menu-item"
              >
                <Icon />
                <div
                  data-testid="page-property-setting-row-name"
                  className={styles.propertyRowName}
                >
                  {name}
                </div>
                <VisibilityModeSelector property={property} />
              </SortablePropertyRow>
            );
          })
        }
      </SortableProperties>,
    ]);
    return renderMenuItemOptions(options);
  }, [manager, t]);

  return (
    <Menu
      contentOptions={{
        onClick(e) {
          e.stopPropagation();
        },
      }}
      items={menuItems}
    >
      {children}
    </Menu>
  );
};

type PageBacklinksPopupProps = PropsWithChildren<{
  backlinks: { docId: string; blockId: string; title: string }[];
}>;

export const PageBacklinksPopup = ({
  backlinks,
  children,
}: PageBacklinksPopupProps) => {
  return (
    <Menu
      contentOptions={{
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

interface PagePropertyRowNameProps {
  property: PageInfoCustomProperty;
  meta: PageInfoCustomPropertyMeta;
  editing: boolean;
  onFinishEditing: () => void;
}

export const PagePropertyRowNameMenu = ({
  editing,
  meta,
  property,
  onFinishEditing,
  children,
}: PropsWithChildren<PagePropertyRowNameProps>) => {
  const manager = useContext(managerContext);
  const [localPropertyMeta, setLocalPropertyMeta] = useState(() => ({
    ...meta,
  }));
  const [localProperty, setLocalProperty] = useState(() => ({ ...property }));
  const nextVisibility = rotateVisibility(localProperty.visibility);

  const [showDeleteModal, setShowDeleteModal] = useState(false);

  useEffect(() => {
    setLocalPropertyMeta(meta);
  }, [meta]);

  useEffect(() => {
    setLocalProperty(property);
  }, [property]);

  const handleFinishEditing = useCallback(() => {
    onFinishEditing();
    manager.updateCustomPropertyMeta(meta.id, localPropertyMeta);
    manager.updateCustomProperty(property.id, localProperty);
  }, [
    localProperty,
    localPropertyMeta,
    manager,
    meta.id,
    onFinishEditing,
    property.id,
  ]);
  const t = useI18n();
  const handleNameBlur = useCallback(
    (v: string) => {
      manager.updateCustomPropertyMeta(meta.id, {
        name: v,
      });
    },
    [manager, meta.id]
  );
  const handleNameChange: (name: string) => void = useCallback(name => {
    setLocalPropertyMeta(prev => ({
      ...prev,
      name: name,
    }));
  }, []);
  const toggleHide = useCallback(
    (e: MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      setLocalProperty(prev => ({
        ...prev,
        visibility: nextVisibility,
      }));
    },
    [nextVisibility]
  );
  const handleDelete = useCallback(() => {
    manager.removeCustomProperty(property.id);
  }, [manager, property.id]);

  const handleIconChange = useCallback(
    (icon: PagePropertyIcon) => {
      setLocalPropertyMeta(prev => ({
        ...prev,
        icon,
      }));
      manager.updateCustomPropertyMeta(meta.id, {
        icon: icon,
      });
    },
    [manager, meta.id]
  );

  const menuItems = useMemo(() => {
    const options: MenuItemOption[] = [];
    options.push(
      <EditPropertyNameMenuItem
        property={localPropertyMeta}
        onIconChange={handleIconChange}
        onNameBlur={handleNameBlur}
        onNameChange={handleNameChange}
      />
    );
    options.push(<PropertyTypeMenuItem property={localPropertyMeta} />);
    if (!localPropertyMeta.required) {
      options.push('-');
      options.push({
        icon:
          nextVisibility === 'hide' || nextVisibility === 'hide-if-empty' ? (
            <InvisibleIcon />
          ) : (
            <ViewIcon />
          ),
        text: t[
          visibilityMenuText(rotateVisibility(localProperty.visibility))
        ](),
        onClick: toggleHide,
      });
      options.push({
        type: 'danger',
        icon: <DeleteIcon />,
        text: t['com.affine.page-properties.property.remove-property'](),
        onClick: () => setShowDeleteModal(true),
      });
    }
    return renderMenuItemOptions(options);
  }, [
    handleIconChange,
    handleNameBlur,
    handleNameChange,
    localProperty.visibility,
    localPropertyMeta,
    nextVisibility,
    t,
    toggleHide,
  ]);

  return (
    <>
      <Menu
        rootOptions={{
          open: editing,
        }}
        contentOptions={{
          onInteractOutside: handleFinishEditing,
          onClick(e) {
            e.stopPropagation();
          },
          onKeyDown(e) {
            if (e.key === 'Escape') {
              handleFinishEditing();
            }
          },
        }}
        items={menuItems}
      >
        {children}
      </Menu>
      <ConfirmDeletePropertyModal
        onConfirm={() => {
          setShowDeleteModal(false);
          handleDelete();
        }}
        onCancel={() => setShowDeleteModal(false)}
        show={showDeleteModal}
        property={meta}
      />
    </>
  );
};

interface PagePropertiesTableHeaderProps {
  className?: string;
  style?: React.CSSProperties;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// backlinks - #no                Updated yyyy-mm-dd
// ─────────────────────────────────────────────────
// Page Info ...
export const PagePropertiesTableHeader = ({
  className,
  style,
  open,
  onOpenChange,
}: PagePropertiesTableHeaderProps) => {
  const manager = useContext(managerContext);

  const t = useI18n();
  const {
    docLinksServices,
    docService,
    workspaceService,
    editorSettingService,
  } = useServices({
    DocLinksServices: DocLinksService,
    DocService,
    WorkspaceService,
    EditorSettingService,
  });
  const docBacklinks = docLinksServices.backlinks;
  const backlinks = useLiveData(docBacklinks.backlinks$);

  const displayDocInfo = useLiveData(
    editorSettingService.editorSetting.settings$.selector(s => s.displayDocInfo)
  );

  const { syncing, retrying, serverClock } = useLiveData(
    workspaceService.workspace.engine.doc.docState$(docService.doc.id)
  );

  const timestampElement = useMemo(() => {
    const localizedCreateTime = manager.createDate
      ? i18nTime(manager.createDate)
      : null;

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
            {manager.createDate && (
              <div className={styles.tableHeaderTimestamp}>
                {t['Created']()} {i18nTime(manager.createDate)}
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
    ) : manager.updatedDate ? (
      <Tooltip side="right" content={createTimeElement}>
        <div className={styles.tableHeaderTimestamp}>
          {t['Updated']()} {i18nTime(manager.updatedDate)}
        </div>
      </Tooltip>
    ) : (
      createTimeElement
    );
  }, [
    manager.createDate,
    manager.updatedDate,
    retrying,
    serverClock,
    syncing,
    t,
  ]);

  const dTimestampElement = useDebouncedValue(timestampElement, 500);

  const handleCollapse = useCallback(() => {
    track.doc.inlineDocInfo.$.toggle();
    onOpenChange(!open);
  }, [onOpenChange, open]);

  const properties = manager.sorter.getOrderedItems();

  return (
    <div className={clsx(styles.tableHeader, className)} style={style}>
      {/* TODO(@Peng): add click handler to backlinks */}
      <div className={styles.tableHeaderInfoRow}>
        {backlinks.length > 0 ? (
          <PageBacklinksPopup backlinks={backlinks}>
            <div className={styles.tableHeaderBacklinksHint}>
              {t['com.affine.page-properties.backlinks']()} · {backlinks.length}
            </div>
          </PageBacklinksPopup>
        ) : null}
        {dTimestampElement}
      </div>
      <Divider />
      {displayDocInfo ? (
        <div className={styles.tableHeaderSecondaryRow}>
          <div className={clsx(!open ? styles.pageInfoDimmed : null)}>
            {t['com.affine.page-properties.page-info']()}
          </div>
          {properties.length === 0 || manager.readonly ? null : (
            <PagePropertiesSettingsPopup>
              <IconButton data-testid="page-info-show-more" size="20">
                <MoreHorizontalIcon />
              </IconButton>
            </PagePropertiesSettingsPopup>
          )}
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

interface PagePropertyRowProps {
  property: PageInfoCustomProperty;
  style?: React.CSSProperties;
  rowNameClassName?: string;
}

export const PagePropertyRow = ({
  property,
  rowNameClassName,
}: PagePropertyRowProps) => {
  const manager = useContext(managerContext);
  const meta = manager.getCustomPropertyMeta(property.id);

  assertExists(meta, 'meta should exist for property');

  const Icon = nameToIcon(meta.icon, meta.type);
  const name = meta.name;
  const ValueRenderer = propertyValueRenderers[meta.type];
  const [editingMeta, setEditingMeta] = useState(false);
  const setEditingItem = useSetAtom(editingPropertyAtom);
  const handleEditMeta = useCallback(() => {
    if (!manager.readonly) {
      setEditingMeta(true);
    }
    setEditingItem(property.id);
  }, [manager.readonly, property.id, setEditingItem]);
  const handleFinishEditingMeta = useCallback(() => {
    setEditingMeta(false);
    setEditingItem(null);
  }, [setEditingItem]);

  // NOTE: if we define a new property type, the value render may not exists in old client
  //       skip rendering if value render is not define yet
  if (!ValueRenderer || typeof ValueRenderer !== 'function') return null;

  return (
    <SortablePropertyRow property={property} data-testid="page-property-row">
      {({ attributes, listeners }) => (
        <>
          <PagePropertyRowNameMenu
            editing={editingMeta}
            meta={meta}
            property={property}
            onFinishEditing={handleFinishEditingMeta}
          >
            <div
              {...attributes}
              {...listeners}
              data-testid="page-property-row-name"
              className={clsx(
                styles.sortablePropertyRowNameCell,
                rowNameClassName
              )}
              onClick={handleEditMeta}
            >
              <div className={styles.propertyRowNameContainer}>
                <div className={styles.propertyRowIconContainer}>
                  <Icon />
                </div>
                <div className={styles.propertyRowName}>{name}</div>
              </div>
            </div>
          </PagePropertyRowNameMenu>
          <ValueRenderer meta={meta} property={property} />
        </>
      )}
    </SortablePropertyRow>
  );
};

export const PageTagsRow = ({
  rowNameClassName,
}: {
  rowNameClassName?: string;
}) => {
  const t = useI18n();
  return (
    <div
      className={styles.tagsPropertyRow}
      data-testid="page-property-row"
      data-property="tags"
    >
      <div
        className={clsx(styles.propertyRowNameCell, rowNameClassName)}
        data-testid="page-property-row-name"
      >
        <div className={styles.propertyRowNameContainer}>
          <div className={styles.propertyRowIconContainer}>
            <TagsIcon />
          </div>
          <div className={styles.propertyRowName}>{t['Tags']()}</div>
        </div>
      </div>
      <TagsValue />
    </div>
  );
};

interface PagePropertiesTableBodyProps {
  className?: string;
  style?: React.CSSProperties;
}

// 🏷️ Tags     (⋅ xxx) (⋅ yyy)
// #️⃣ Number   123456
// +  Add a property
export const PagePropertiesTableBody = ({
  className,
  style,
}: PagePropertiesTableBodyProps) => {
  const manager = useContext(managerContext);
  return (
    <Collapsible.Content
      className={clsx(styles.tableBodyRoot, className)}
      style={style}
    >
      <PageTagsRow />
      <SortableProperties>
        {properties =>
          properties.length ? (
            <div className={styles.tableBodySortable}>
              {properties
                .filter(
                  property =>
                    manager.isPropertyRequired(property.id) ||
                    (property.visibility !== 'hide' &&
                      !(
                        property.visibility === 'hide-if-empty' &&
                        !property.value
                      ))
                )
                .map(property => (
                  <PagePropertyRow key={property.id} property={property} />
                ))}
            </div>
          ) : null
        }
      </SortableProperties>
      {manager.readonly ? null : <PagePropertiesAddProperty />}
      <Divider />
    </Collapsible.Content>
  );
};

interface PagePropertiesCreatePropertyMenuItemsProps {
  onCreated?: (e: React.MouseEvent, id: string) => void;
  metaManager: PagePropertiesMetaManager;
}

const findNextDefaultName = (name: string, allNames: string[]): string => {
  const nameExists = allNames.includes(name);
  if (nameExists) {
    const match = name.match(/(\d+)$/);
    if (match) {
      const num = parseInt(match[1], 10);
      const nextName = name.replace(/(\d+)$/, `${num + 1}`);
      return findNextDefaultName(nextName, allNames);
    } else {
      return findNextDefaultName(`${name} 2`, allNames);
    }
  } else {
    return name;
  }
};

export const PagePropertiesCreatePropertyMenuItems = ({
  onCreated,
  metaManager,
}: PagePropertiesCreatePropertyMenuItemsProps) => {
  const t = useI18n();
  const onAddProperty = useCallback(
    (
      e: React.MouseEvent,
      option: { type: PagePropertyType; name: string; icon: string }
    ) => {
      const schemaList = metaManager.getOrderedPropertiesSchema();
      const nameExists = schemaList.some(meta => meta.name === option.name);
      const allNames = schemaList.map(meta => meta.name);
      const name = nameExists
        ? findNextDefaultName(option.name, allNames)
        : option.name;
      const { id } = metaManager.addPropertyMeta({
        name,
        icon: option.icon,
        type: option.type,
      });
      onCreated?.(e, id);
    },
    [metaManager, onCreated]
  );

  return useMemo(() => {
    const options: MenuItemOption[] = [];
    options.push(
      <div role="heading" className={styles.menuHeader}>
        {t['com.affine.page-properties.create-property.menu.header']()}
      </div>
    );
    options.push('-');
    options.push(
      newPropertyTypes.map(type => {
        const iconName = getDefaultIconName(type);
        const Icon = nameToIcon(iconName, type);
        const name = t[`com.affine.page-properties.property.${type}`]();
        return {
          icon: <Icon />,
          text: name,
          onClick: (e: React.MouseEvent) => {
            onAddProperty(e, {
              icon: iconName,
              name: name,
              type: type,
            });
          },
        };
      })
    );
    return renderMenuItemOptions(options);
  }, [onAddProperty, t]);
};

interface PagePropertiesAddPropertyMenuItemsProps {
  onCreateClicked: (e: React.MouseEvent) => void;
}

const PagePropertiesAddPropertyMenuItems = ({
  onCreateClicked,
}: PagePropertiesAddPropertyMenuItemsProps) => {
  const manager = useContext(managerContext);

  const t = useI18n();
  const metaList = manager.metaManager.getOrderedPropertiesSchema();
  const nonRequiredMetaList = metaList.filter(meta => !meta.required);
  const isChecked = useCallback(
    (m: string) => {
      return manager.hasCustomProperty(m);
    },
    [manager]
  );

  const onClickProperty = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      e.preventDefault();
      if (isChecked(id)) {
        manager.removeCustomProperty(id);
      } else {
        manager.addCustomProperty(id);
      }
    },
    [isChecked, manager]
  );

  const menuItems = useMemo(() => {
    const options: MenuItemOption[] = [];
    options.push(
      <div role="heading" className={styles.menuHeader}>
        {t['com.affine.page-properties.add-property.menu.header']()}
      </div>
    );

    if (nonRequiredMetaList.length > 0) {
      options.push('-');
      const nonRequiredMetaOptions: MenuItemOption = nonRequiredMetaList.map(
        meta => {
          const Icon = nameToIcon(meta.icon, meta.type);
          const name = meta.name;
          return {
            icon: <Icon />,
            text: name,
            selected: isChecked(meta.id),
            onClick: (e: React.MouseEvent) => onClickProperty(e, meta.id),
          };
        }
      );
      options.push(nonRequiredMetaOptions);
    }
    options.push('-');
    options.push({
      icon: <PlusIcon />,
      text: t['com.affine.page-properties.add-property.menu.create'](),
      onClick: onCreateClicked,
    });

    return renderMenuItemOptions(options);
  }, [isChecked, nonRequiredMetaList, onClickProperty, onCreateClicked, t]);

  return menuItems;
};

export const PagePropertiesAddProperty = () => {
  const t = useI18n();
  const [adding, setAdding] = useState(true);
  const manager = useContext(managerContext);
  const toggleAdding: MouseEventHandler = useCallback(e => {
    e.stopPropagation();
    e.preventDefault();
    setAdding(prev => !prev);
  }, []);

  const menuOptions = useMemo(() => {
    const handleCreated = (e: React.MouseEvent, id: string) => {
      toggleAdding(e);
      manager.addCustomProperty(id);
    };
    const items = adding ? (
      <PagePropertiesAddPropertyMenuItems onCreateClicked={toggleAdding} />
    ) : (
      <PagePropertiesCreatePropertyMenuItems
        metaManager={manager.metaManager}
        onCreated={handleCreated}
      />
    );

    return {
      contentOptions: {
        onClick(e) {
          e.stopPropagation();
        },
      },
      rootOptions: {
        onOpenChange: () => setAdding(true),
      },
      items,
    } satisfies Partial<MenuProps>;
  }, [adding, manager, toggleAdding]);

  return (
    <Menu {...menuOptions}>
      <Button
        variant="plain"
        prefix={<PlusIcon />}
        className={styles.addPropertyButton}
      >
        {t['com.affine.page-properties.add-property']()}
      </Button>
    </Menu>
  );
};

const PagePropertiesTableInner = () => {
  const manager = useContext(managerContext);
  const [expanded, setExpanded] = useState(false);
  use(manager.workspace.docCollection.doc.whenSynced);
  return (
    <div className={styles.root}>
      <Collapsible.Root
        open={expanded}
        onOpenChange={setExpanded}
        className={styles.rootCentered}
      >
        <PagePropertiesTableHeader open={expanded} onOpenChange={setExpanded} />
        <PagePropertiesTableBody />
      </Collapsible.Root>
    </div>
  );
};

export const usePagePropertiesManager = (docId: string) => {
  // the workspace properties adapter adapter is reactive,
  // which means it's reference will change when any of the properties change
  // also it will trigger a re-render of the component
  const adapter = useCurrentWorkspacePropertiesAdapter();
  const manager = useMemo(() => {
    return new PagePropertiesManager(adapter, docId);
  }, [adapter, docId]);
  return manager;
};

// this is the main component that renders the page properties table at the top of the page below
// the page title
export const PagePropertiesTable = ({ docId }: { docId: string }) => {
  const manager = usePagePropertiesManager(docId);

  // if the given page is not in the current workspace, then we don't render anything
  // eg. when it is in history modal

  if (!manager.page) {
    return null;
  }

  return (
    <managerContext.Provider value={manager}>
      <Suspense>
        <PagePropertiesTableInner />
      </Suspense>
    </managerContext.Provider>
  );
};
