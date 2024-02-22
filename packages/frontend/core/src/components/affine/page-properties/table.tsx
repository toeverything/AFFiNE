import {
  Button,
  IconButton,
  Menu,
  MenuIcon,
  MenuItem,
  Scrollable,
  Tooltip,
} from '@affine/component';
import { useCurrentWorkspacePropertiesAdapter } from '@affine/core/hooks/use-affine-adapter';
import { useBlockSuitePageBacklinks } from '@affine/core/hooks/use-block-suite-page-backlinks';
import type {
  PageInfoCustomProperty,
  PageInfoCustomPropertyMeta,
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
  ToggleExpandIcon,
  ViewIcon,
} from '@blocksuite/icons';
import type { Page } from '@blocksuite/store';
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
import { arrayMove, SortableContext, useSortable } from '@dnd-kit/sortable';
import * as Collapsible from '@radix-ui/react-collapsible';
import clsx from 'clsx';
import { use } from 'foxact/use';
import { useAtom, useAtomValue } from 'jotai';
import type React from 'react';
import {
  type ChangeEventHandler,
  type CSSProperties,
  type MouseEvent,
  type MouseEventHandler,
  type PropsWithChildren,
  Suspense,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';

import { AffinePageReference } from '../reference-link';
import { managerContext, pageInfoCollapsedAtom } from './common';
import { getDefaultIconName, nameToIcon } from './icons-mapping';
import {
  type NewPropertyOption,
  newPropertyOptions,
  PagePropertiesManager,
} from './page-properties-manager';
import { propertyValueRenderers } from './property-row-values';
import * as styles from './styles.css';

type PagePropertiesSettingsPopupProps = PropsWithChildren<{
  className?: string;
  style?: React.CSSProperties;
}>;

const Divider = () => <div className={styles.tableHeaderDivider} />;

type PropertyVisibility = PageInfoCustomProperty['visibility'];

const SortableProperties = ({ children }: PropsWithChildren) => {
  const manager = useContext(managerContext);
  const properties = manager.getOrderedCustomProperties();
  const readonly = manager.readonly;
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );
  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (readonly) {
        return;
      }
      const { active, over } = event;
      const fromIndex = properties.findIndex(p => p.id === active.id);
      const toIndex = properties.findIndex(p => p.id === over?.id);

      if (fromIndex !== -1 && toIndex !== -1 && fromIndex !== toIndex) {
        const newOrdered = arrayMove(properties, fromIndex, toIndex);
        manager.transact(() => {
          newOrdered.forEach((p, i) => {
            manager.updateCustomProperty(p.id, {
              order: i,
            });
          });
        });
      }
    },
    [manager, properties, readonly]
  );
  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd} modifiers={modifiers}>
      <SortableContext items={properties}>{children}</SortableContext>
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
  } = useSortable({
    id: property.id,
  });
  const style: CSSProperties = useMemo(
    () => ({
      transform: transform
        ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
        : undefined,
      transition,
      pointerEvents: manager.readonly ? 'none' : undefined,
    }),
    [manager.readonly, transform, transition]
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

  if (!meta) {
    return null;
  }

  const required = meta.required;
  const visibility = property.visibility || 'visible';

  return (
    <Menu
      items={
        <>
          {visibilities.map(v => {
            const text = visibilitySelectorText(v);
            return (
              <MenuItem
                key={v}
                checked={visibility === v}
                data-testid="page-properties-visibility-menu-item"
                onClick={() => {
                  manager.updateCustomProperty(property.id, {
                    visibility: v,
                  });
                }}
              >
                {t[text]()}
              </MenuItem>
            );
          })}
        </>
      }
      rootOptions={{
        open: required ? false : undefined,
      }}
    >
      <div data-required={required} className={styles.selectorButton}>
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
  const properties = manager.getOrderedCustomProperties();

  return (
    <Menu
      items={
        <>
          <div className={styles.menuHeader}>
            {t['com.affine.page-properties.settings.title']()}
          </div>
          <Divider />
          <Scrollable.Root className={styles.menuItemListScrollable}>
            <Scrollable.Viewport className={styles.menuItemList}>
              <SortableProperties>
                {properties.map(property => {
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
                      <div className={styles.propertyRowName}>{name}</div>
                      <VisibilityModeSelector property={property} />
                    </SortablePropertyRow>
                  );
                })}
              </SortableProperties>
            </Scrollable.Viewport>
          </Scrollable.Root>
        </>
      }
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
      items={
        <div className={styles.backlinksList}>
          {backlinks.map(pageId => (
            <AffinePageReference
              key={pageId}
              wrapper={MenuItem}
              pageId={pageId}
              workspace={manager.workspace.blockSuiteWorkspace}
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

export const PagePropertyRowName = ({
  editing,
  meta,
  property,
  onFinishEditing,
  children,
}: PropsWithChildren<PagePropertyRowNameProps>) => {
  const manager = useContext(managerContext);
  const Icon = nameToIcon(meta.icon, meta.type);
  const localPropertyMetaRef = useRef({ ...meta });
  const localPropertyRef = useRef({ ...property });
  const [nextVisibility, setNextVisibility] = useState(property.visibility);
  const toHide =
    nextVisibility === 'hide' || nextVisibility === 'hide-if-empty';

  const handleFinishEditing = useCallback(() => {
    onFinishEditing();
    manager.updateCustomPropertyMeta(meta.id, localPropertyMetaRef.current);
    manager.updateCustomProperty(property.id, localPropertyRef.current);
  }, [manager, meta.id, onFinishEditing, property.id]);
  const t = useAFFiNEI18N();
  const handleNameBlur: ChangeEventHandler<HTMLInputElement> = useCallback(
    e => {
      e.stopPropagation();
      manager.updateCustomPropertyMeta(meta.id, {
        name: e.target.value,
      });
    },
    [manager, meta.id]
  );
  const handleNameChange: ChangeEventHandler<HTMLInputElement> = useCallback(
    e => {
      localPropertyMetaRef.current.name = e.target.value;
    },
    []
  );
  const toggleHide = useCallback((e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const nextVisibility = rotateVisibility(
      localPropertyRef.current.visibility
    );
    setNextVisibility(nextVisibility);
    localPropertyRef.current.visibility = nextVisibility;
  }, []);
  const handleDelete = useCallback(
    (e: MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      manager.removeCustomProperty(property.id);
    },
    [manager, property.id]
  );

  return (
    <Menu
      rootOptions={{
        open: editing,
      }}
      contentOptions={{
        onInteractOutside: handleFinishEditing,
      }}
      items={
        <>
          <div className={styles.propertyRowNamePopupRow}>
            <div className={styles.propertyNameIconEditable}>
              <Icon />
            </div>
            <input
              className={styles.propertyNameInput}
              defaultValue={meta.name}
              onBlur={handleNameBlur}
              onChange={handleNameChange}
            />
          </div>
          <Divider />
          <MenuItem
            preFix={
              <MenuIcon>{!toHide ? <ViewIcon /> : <InvisibleIcon />}</MenuIcon>
            }
            data-testid="page-property-row-name-hide-menu-item"
            onClick={toggleHide}
          >
            {t[visibilityMenuText(nextVisibility)]()}
          </MenuItem>
          <MenuItem
            type="danger"
            preFix={
              <MenuIcon>
                <DeleteIcon />
              </MenuIcon>
            }
            data-testid="page-property-row-name-delete-menu-item"
            onClick={handleDelete}
          >
            {t['com.affine.page-properties.property.remove-property']()}
          </MenuItem>
        </>
      }
    >
      {children}
    </Menu>
  );
};

interface PagePropertiesTableHeaderProps {
  className?: string;
  style?: React.CSSProperties;
}

// backlinks - #no                Updated yyyy-mm-dd
// ─────────────────────────────────────────────────
// Page Info ...
export const PagePropertiesTableHeader = ({
  className,
  style,
}: PagePropertiesTableHeaderProps) => {
  const manager = useContext(managerContext);

  const t = useAFFiNEI18N();
  const backlinks = useBlockSuitePageBacklinks(
    manager.workspace.blockSuiteWorkspace,
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

  const [collapsed, setCollapsed] = useAtom(pageInfoCollapsedAtom);
  const handleCollapse = useCallback(() => {
    setCollapsed(prev => !prev);
  }, [setCollapsed]);

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
        <div className={clsx(collapsed ? styles.pageInfoDimmed : null)}>
          {t['com.affine.page-properties.page-info']()}
        </div>
        {(collapsed && properties.length === 0) || manager.readonly ? null : (
          <PagePropertiesSettingsPopup>
            <IconButton type="plain" icon={<MoreHorizontalIcon />} />
          </PagePropertiesSettingsPopup>
        )}
        <div className={styles.spacer} />
        <Collapsible.Trigger asChild role="button" onClick={handleCollapse}>
          <IconButton
            type="plain"
            icon={
              <ToggleExpandIcon
                className={styles.collapsedIcon}
                data-collapsed={collapsed !== false}
              />
            }
          />
        </Collapsible.Trigger>
      </div>
    </div>
  );
};

const usePagePropertiesManager = (page: Page) => {
  // the workspace properties adapter adapter is reactive,
  // which means it's reference will change when any of the properties change
  // also it will trigger a re-render of the component
  const adapter = useCurrentWorkspacePropertiesAdapter();
  const manager = useMemo(() => {
    return new PagePropertiesManager(adapter, page.id);
  }, [adapter, page.id]);
  return manager;
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
  const handleEditMeta = useCallback(() => {
    if (!manager.readonly) {
      setEditingMeta(true);
    }
  }, [manager.readonly]);
  const handleFinishEditingMeta = useCallback(() => {
    setEditingMeta(false);
  }, []);
  return (
    <SortablePropertyRow
      property={property}
      className={styles.propertyRow}
      data-testid="page-property-row"
      data-property={property.id}
      data-draggable={!manager.readonly}
    >
      {({ attributes, listeners }) => (
        <>
          <PagePropertyRowName
            editing={editingMeta}
            meta={meta}
            property={property}
            onFinishEditing={handleFinishEditingMeta}
          >
            <div
              {...attributes}
              {...listeners}
              className={styles.propertyRowNameCell}
              onClick={handleEditMeta}
            >
              <div className={styles.propertyRowIconContainer}>
                <Icon />
              </div>
              <div className={styles.propertyRowName}>{name}</div>
            </div>
          </PagePropertyRowName>
          <ValueRenderer meta={meta} property={property} />
        </>
      )}
    </SortablePropertyRow>
  );
};

interface PagePropertiesTableBodyProps {
  className?: string;
  style?: React.CSSProperties;
}

const modifiers = [restrictToParentElement, restrictToVerticalAxis];

// 🏷️ Tags     (⋅ xxx) (⋅ yyy)
// #️⃣ Number   123456
// +  Add a property
export const PagePropertiesTableBody = ({
  className,
  style,
}: PagePropertiesTableBodyProps) => {
  const manager = useContext(managerContext);
  const properties = manager.getOrderedCustomProperties();
  return (
    <Collapsible.Content
      className={clsx(styles.tableBodyRoot, className)}
      style={style}
    >
      <div className={styles.tableBody}>
        <SortableProperties>
          {properties
            .filter(
              property =>
                property.visibility !== 'hide' &&
                !(property.visibility === 'hide-if-empty' && !property.value)
            )
            .map(property => (
              <PagePropertyRow key={property.id} property={property} />
            ))}
        </SortableProperties>
      </div>
      {manager.readonly ? null : <PagePropertiesAddProperty />}
      <Divider />
    </Collapsible.Content>
  );
};

interface PagePropertiesCreatePropertyMenuItemsProps {
  onCreated?: (e: React.MouseEvent, id: string) => void;
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
}: PagePropertiesCreatePropertyMenuItemsProps) => {
  const manager = useContext(managerContext);
  const t = useAFFiNEI18N();
  const onAddProperty = useCallback(
    (e: React.MouseEvent, option: NewPropertyOption & { icon: string }) => {
      const nameExists = manager.metaManager
        .getOrderedCustomPropertiesSchema()
        .some(meta => meta.name === option.name);
      const allNames = manager.metaManager
        .getOrderedCustomPropertiesSchema()
        .map(meta => meta.name);
      const name = nameExists
        ? findNextDefaultName(option.name, allNames)
        : option.name;
      const { id } = manager.metaManager.addCustomPropertyMeta({
        name,
        icon: option.icon,
        type: option.type,
      });
      onCreated?.(e, id);
    },
    [manager.metaManager, onCreated]
  );
  return (
    <>
      <div className={styles.menuHeader}>
        {t['com.affine.page-properties.create-property.menu.header']()}
      </div>
      <Divider />
      <div className={styles.menuItemList}>
        {newPropertyOptions.map(({ name, type }) => {
          const iconName = getDefaultIconName(type);
          const Icon = nameToIcon(iconName, type);
          return (
            <MenuItem
              key={type}
              preFix={
                <MenuIcon>
                  <Icon />
                </MenuIcon>
              }
              data-testid="page-properties-create-property-menu-item"
              onClick={e => {
                onAddProperty(e, { icon: iconName, name, type });
              }}
            >
              {name}
            </MenuItem>
          );
        })}
      </div>
    </>
  );
};

interface PagePropertiesAddPropertyMenuItemsProps {
  onCreateClicked?: (e: React.MouseEvent) => void;
}

const PagePropertiesAddPropertyMenuItems = ({
  onCreateClicked,
}: PagePropertiesAddPropertyMenuItemsProps) => {
  const manager = useContext(managerContext);

  const t = useAFFiNEI18N();
  const metaList = manager.metaManager.getOrderedCustomPropertiesSchema();
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

  return (
    <>
      <div className={styles.menuHeader}>
        {t['com.affine.page-properties.add-property.menu.header']()}
      </div>
      {/* hide available properties if there are none */}
      {metaList.length > 0 ? (
        <>
          <Divider />
          <Scrollable.Root className={styles.menuItemListScrollable}>
            <Scrollable.Viewport className={styles.menuItemList}>
              {metaList.map(meta => {
                const Icon = nameToIcon(meta.icon, meta.type);
                const name = meta.name;
                return (
                  <MenuItem
                    key={meta.id}
                    preFix={
                      <MenuIcon>
                        <Icon />
                      </MenuIcon>
                    }
                    data-testid="page-properties-add-property-menu-item"
                    data-property={meta.id}
                    checked={isChecked(meta.id)}
                    onClick={(e: React.MouseEvent) =>
                      onClickProperty(e, meta.id)
                    }
                  >
                    {name}
                  </MenuItem>
                );
              })}
            </Scrollable.Viewport>
            <Scrollable.Scrollbar className={styles.menuItemListScrollbar} />
          </Scrollable.Root>
        </>
      ) : null}
      <Divider />
      <MenuItem
        onClick={onCreateClicked}
        preFix={
          <MenuIcon>
            <PlusIcon />
          </MenuIcon>
        }
      >
        <div className={styles.menuItemName}>
          {t['com.affine.page-properties.add-property.menu.create']()}
        </div>
      </MenuItem>
    </>
  );
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
  const handleCreated = useCallback(
    (e: React.MouseEvent, id: string) => {
      toggleAdding(e);
      manager.addCustomProperty(id);
    },
    [manager, toggleAdding]
  );
  const items = adding ? (
    <PagePropertiesAddPropertyMenuItems onCreateClicked={toggleAdding} />
  ) : (
    <PagePropertiesCreatePropertyMenuItems onCreated={handleCreated} />
  );
  return (
    <Menu rootOptions={{ onOpenChange: () => setAdding(true) }} items={items}>
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
  const collapsed = useAtomValue(pageInfoCollapsedAtom);
  use(manager.workspace.blockSuiteWorkspace.doc.whenSynced);
  return (
    <div className={styles.root}>
      <Collapsible.Root open={!collapsed} className={styles.rootCentered}>
        <PagePropertiesTableHeader />
        <PagePropertiesTableBody />
      </Collapsible.Root>
    </div>
  );
};

// this is the main component that renders the page properties table at the top of the page below
// the page title
export const PagePropertiesTable = ({ page }: { page: Page }) => {
  const manager = usePagePropertiesManager(page);

  return (
    <managerContext.Provider value={manager}>
      <Suspense>
        <PagePropertiesTableInner />
      </Suspense>
    </managerContext.Provider>
  );
};
