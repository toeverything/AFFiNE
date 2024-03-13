import {
  Button,
  IconButton,
  Menu,
  MenuIcon,
  MenuItem,
  type MenuProps,
  Tooltip,
} from '@affine/component';
import { useCurrentWorkspacePropertiesAdapter } from '@affine/core/hooks/use-affine-adapter';
import { useBlockSuitePageBacklinks } from '@affine/core/hooks/use-block-suite-page-backlinks';
import type {
  PageInfoCustomProperty,
  PageInfoCustomPropertyMeta,
  PagePropertyType,
} from '@affine/core/modules/workspace/properties/schema';
import { timestampToLocalDate } from '@affine/core/utils';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { assertExists } from '@blocksuite/global/utils';
import {
  ArrowDownSmallIcon,
  DeleteIcon,
  InvisibleIcon,
  MoreHorizontalIcon,
  PlusIcon,
  TagsIcon,
  ToggleExpandIcon,
  ViewIcon,
} from '@blocksuite/icons';
import type { Doc } from '@blocksuite/store';
import {
  DndContext,
  type DragEndEvent,
  type DraggableAttributes,
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
import clsx from 'clsx';
import { use } from 'foxact/use';
import { atom, useAtomValue, useSetAtom } from 'jotai';
import type React from 'react';
import {
  type CSSProperties,
  type MouseEvent,
  type MouseEventHandler,
  type PropsWithChildren,
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
import {
  getDefaultIconName,
  nameToIcon,
  type PagePropertyIcon,
} from './icons-mapping';
import {
  EditPropertyNameMenuItem,
  type MenuItemOption,
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

const SortableProperties = ({ children }: SortablePropertiesProps) => {
  const manager = useContext(managerContext);
  const properties = useMemo(
    () => manager.getOrderedCustomProperties(),
    [manager]
  );
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
      const fromIndex = properties.findIndex(p => p.id === active.id);
      const toIndex = properties.findIndex(p => p.id === over?.id);

      if (fromIndex !== -1 && toIndex !== -1 && fromIndex !== toIndex) {
        manager.moveCustomProperty(fromIndex, toIndex);
        setLocalProperties(manager.getOrderedCustomProperties());
      }
    },
    [manager, properties, draggable]
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
  const t = useAFFiNEI18N();
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
  const t = useAFFiNEI18N();

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
                <MenuIcon>
                  <Icon />
                </MenuIcon>
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
  backlinks: string[];
}>;

export const PageBacklinksPopup = ({
  backlinks,
  children,
}: PageBacklinksPopupProps) => {
  const manager = useContext(managerContext);

  return (
    <Menu
      contentOptions={{
        onClick(e) {
          e.stopPropagation();
        },
      }}
      items={
        <div className={styles.backlinksList}>
          {backlinks.map(pageId => (
            <AffinePageReference
              key={pageId}
              wrapper={MenuItem}
              pageId={pageId}
              docCollection={manager.workspace.docCollection}
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
  const t = useAFFiNEI18N();
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

  const t = useAFFiNEI18N();
  const backlinks = useBlockSuitePageBacklinks(
    manager.workspace.docCollection,
    manager.pageId
  );

  const timestampElement = useMemo(() => {
    const localizedUpdateTime = manager.updatedDate
      ? timestampToLocalDate(manager.updatedDate)
      : null;

    const localizedCreateTime = manager.createDate
      ? timestampToLocalDate(manager.createDate)
      : null;

    const updateTimeElement = (
      <div className={styles.tableHeaderTimestamp}>
        {t['Updated']()} {localizedUpdateTime}
      </div>
    );

    const createTimeElement = (
      <div className={styles.tableHeaderTimestamp}>
        {t['Created']()} {localizedCreateTime}
      </div>
    );

    return localizedUpdateTime ? (
      <Tooltip side="right" content={createTimeElement}>
        {updateTimeElement}
      </Tooltip>
    ) : (
      createTimeElement
    );
  }, [manager.createDate, manager.updatedDate, t]);

  const handleCollapse = useCallback(() => {
    onOpenChange(!open);
  }, [onOpenChange, open]);

  const properties = manager.getOrderedCustomProperties();

  return (
    <div className={clsx(styles.tableHeader, className)} style={style}>
      {/* todo: add click handler to backlinks */}
      <div className={styles.tableHeaderInfoRow}>
        {backlinks.length > 0 ? (
          <PageBacklinksPopup backlinks={backlinks}>
            <div className={styles.tableHeaderBacklinksHint}>
              {t['com.affine.page-properties.backlinks']()} · {backlinks.length}
            </div>
          </PageBacklinksPopup>
        ) : null}
        {timestampElement}
      </div>
      <Divider />
      <div className={styles.tableHeaderSecondaryRow}>
        <div className={clsx(!open ? styles.pageInfoDimmed : null)}>
          {t['com.affine.page-properties.page-info']()}
        </div>
        {properties.length === 0 || manager.readonly ? null : (
          <PagePropertiesSettingsPopup>
            <IconButton
              data-testid="page-info-show-more"
              type="plain"
              icon={<MoreHorizontalIcon />}
            />
          </PagePropertiesSettingsPopup>
        )}
        <Collapsible.Trigger asChild role="button" onClick={handleCollapse}>
          <div
            className={styles.tableHeaderCollapseButtonWrapper}
            data-testid="page-info-collapse"
          >
            <IconButton
              type="plain"
              icon={
                <ToggleExpandIcon
                  className={styles.collapsedIcon}
                  data-collapsed={!open}
                />
              }
            />
          </div>
        </Collapsible.Trigger>
      </div>
    </div>
  );
};

interface PagePropertyRowProps {
  property: PageInfoCustomProperty;
  style?: React.CSSProperties;
}

const PagePropertyRow = ({ property }: PagePropertyRowProps) => {
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
              className={styles.sortablePropertyRowNameCell}
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

const PageTagsRow = () => {
  const t = useAFFiNEI18N();
  return (
    <div
      className={styles.tagsPropertyRow}
      data-testid="page-property-row"
      data-property="tags"
    >
      <div
        className={styles.propertyRowNameCell}
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
  const t = useAFFiNEI18N();
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

  const t = useAFFiNEI18N();
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
  const t = useAFFiNEI18N();
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
        type="plain"
        icon={<PlusIcon />}
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

const usePagePropertiesManager = (page: Doc) => {
  // the workspace properties adapter adapter is reactive,
  // which means it's reference will change when any of the properties change
  // also it will trigger a re-render of the component
  const adapter = useCurrentWorkspacePropertiesAdapter();
  const manager = useMemo(() => {
    return new PagePropertiesManager(adapter, page.id);
  }, [adapter, page.id]);
  return manager;
};

// this is the main component that renders the page properties table at the top of the page below
// the page title
export const PagePropertiesTable = ({ page }: { page: Doc }) => {
  const manager = usePagePropertiesManager(page);

  // if the given page is not in the current workspace, then we don't render anything
  // eg. when it is in history modal

  if (!manager.page || manager.readonly) {
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
