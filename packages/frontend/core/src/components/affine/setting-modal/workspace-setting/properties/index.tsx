import { Button, IconButton, Menu } from '@affine/component';
import { SettingHeader } from '@affine/component/setting-components';
import { useWorkspaceInfo } from '@affine/core/components/hooks/use-workspace-info';
import type { PageInfoCustomPropertyMeta } from '@affine/core/modules/properties/services/schema';
import { Trans, useI18n } from '@affine/i18n';
import {
  DeleteIcon,
  FilterIcon,
  MoreHorizontalIcon,
} from '@blocksuite/icons/rc';
import { FrameworkScope, type WorkspaceMetadata } from '@toeverything/infra';
import type { MouseEvent } from 'react';
import {
  createContext,
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { useCurrentWorkspacePropertiesAdapter } from '../../../../../components/hooks/use-affine-adapter';
import { useWorkspace } from '../../../../../components/hooks/use-workspace';
import type { PagePropertyIcon } from '../../../page-properties';
import {
  nameToIcon,
  PagePropertiesCreatePropertyMenuItems,
  PagePropertiesMetaManager,
} from '../../../page-properties';
import { ConfirmDeletePropertyModal } from '../../../page-properties/confirm-delete-property-modal';
import type { MenuItemOption } from '../../../page-properties/menu-items';
import {
  EditPropertyNameMenuItem,
  PropertyTypeMenuItem,
  renderMenuItemOptions,
} from '../../../page-properties/menu-items';
import * as styles from './styles.css';

// @ts-expect-error this should always be set
const managerContext = createContext<PagePropertiesMetaManager>();

const usePagePropertiesMetaManager = () => {
  // the workspace properties adapter adapter is reactive,
  // which means it's reference will change when any of the properties change
  // also it will trigger a re-render of the component
  const adapter = useCurrentWorkspacePropertiesAdapter();
  const manager = useMemo(() => {
    return new PagePropertiesMetaManager(adapter);
  }, [adapter]);
  return manager;
};

const Divider = () => {
  return <div className={styles.divider} />;
};

const EditPropertyButton = ({
  property,
}: {
  property: PageInfoCustomPropertyMeta;
}) => {
  const t = useI18n();
  const manager = useContext(managerContext);
  const [localPropertyMeta, setLocalPropertyMeta] = useState(() => ({
    ...property,
  }));
  useEffect(() => {
    setLocalPropertyMeta(property);
  }, [property]);
  const handleToggleRequired = useCallback(() => {
    manager.updatePropertyMeta(localPropertyMeta.id, {
      required: !localPropertyMeta.required,
    });
  }, [manager, localPropertyMeta.id, localPropertyMeta.required]);
  const handleDelete = useCallback(() => {
    manager.removePropertyMeta(localPropertyMeta.id);
  }, [manager, localPropertyMeta.id]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const handleFinishEditing = useCallback(() => {
    setOpen(false);
    setEditing(false);
    manager.updatePropertyMeta(localPropertyMeta.id, localPropertyMeta);
  }, [localPropertyMeta, manager]);

  const defaultMenuItems = useMemo(() => {
    const options: MenuItemOption[] = [];
    options.push({
      text: t['com.affine.settings.workspace.properties.set-as-required'](),
      onClick: handleToggleRequired,
      checked: localPropertyMeta.required,
    });
    options.push('-');
    options.push({
      text: t['com.affine.settings.workspace.properties.edit-property'](),
      onClick: e => {
        e.preventDefault();
        setEditing(true);
      },
    });
    options.push({
      text: t['com.affine.settings.workspace.properties.delete-property'](),
      onClick: () => setShowDeleteModal(true),
      type: 'danger',
      icon: <DeleteIcon />,
    });
    return renderMenuItemOptions(options);
  }, [handleToggleRequired, localPropertyMeta.required, t]);

  const handleNameBlur = useCallback(
    (e: string) => {
      manager.updatePropertyMeta(localPropertyMeta.id, {
        name: e,
      });
    },
    [manager, localPropertyMeta.id]
  );
  const handleNameChange = useCallback((e: string) => {
    setLocalPropertyMeta(prev => ({
      ...prev,
      name: e,
    }));
  }, []);
  const handleIconChange = useCallback(
    (icon: PagePropertyIcon) => {
      setLocalPropertyMeta(prev => ({
        ...prev,
        icon,
      }));
      manager.updatePropertyMeta(localPropertyMeta.id, {
        icon,
      });
    },
    [localPropertyMeta.id, manager]
  );
  const editMenuItems = useMemo(() => {
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
    options.push('-');
    options.push({
      text: t['com.affine.settings.workspace.properties.delete-property'](),
      onClick: handleDelete,
      type: 'danger',
      icon: <DeleteIcon />,
    });
    return renderMenuItemOptions(options);
  }, [
    handleDelete,
    handleIconChange,
    handleNameBlur,
    handleNameChange,
    localPropertyMeta,
    t,
  ]);

  return (
    <>
      <Menu
        rootOptions={{
          open,
          onOpenChange: handleFinishEditing,
        }}
        items={editing ? editMenuItems : defaultMenuItems}
      >
        <IconButton onClick={() => setOpen(true)} size="20">
          <MoreHorizontalIcon />
        </IconButton>
      </Menu>
      <ConfirmDeletePropertyModal
        onConfirm={() => {
          setShowDeleteModal(false);
          handleDelete();
        }}
        onCancel={() => setShowDeleteModal(false)}
        show={showDeleteModal}
        property={property}
      />
    </>
  );
};

const CustomPropertyRow = ({
  property,
  relatedPages,
}: {
  relatedPages: string[];
  property: PageInfoCustomPropertyMeta;
}) => {
  const Icon = nameToIcon(property.icon, property.type);
  const required = property.required;
  const t = useI18n();
  return (
    <div
      className={styles.propertyRow}
      data-property-id={property.id}
      data-testid="custom-property-row"
    >
      <Icon className={styles.propertyIcon} />
      <div data-unnamed={!property.name} className={styles.propertyName}>
        {property.name || t['unnamed']()}
      </div>
      {relatedPages.length > 0 ? (
        <div className={styles.propertyDocCount}>
          ·{' '}
          <Trans
            i18nKey={
              relatedPages.length > 1
                ? 'com.affine.settings.workspace.properties.doc_others'
                : 'com.affine.settings.workspace.properties.doc'
            }
            count={relatedPages.length}
          >
            <span>{{ count: relatedPages.length } as any}</span> doc
          </Trans>
        </div>
      ) : null}
      <div className={styles.spacer} />
      {required ? (
        <div className={styles.propertyRequired}>
          {t['com.affine.page-properties.property.required']()}
        </div>
      ) : null}
      <EditPropertyButton property={property} />
    </div>
  );
};

const propertyFilterModes = ['all', 'in-use', 'unused'] as const;
type PropertyFilterMode = (typeof propertyFilterModes)[number];

const CustomPropertyRows = ({
  properties,
  statistics,
}: {
  properties: PageInfoCustomPropertyMeta[];
  statistics: Map<string, Set<string>>;
}) => {
  return (
    <div className={styles.metaList}>
      {properties.map(property => {
        const pages = [...(statistics.get(property.id) ?? [])];
        return (
          <Fragment key={property.id}>
            <CustomPropertyRow property={property} relatedPages={pages} />
            <Divider />
          </Fragment>
        );
      })}
    </div>
  );
};

const CustomPropertyRowsList = ({
  filterMode,
}: {
  filterMode: PropertyFilterMode;
}) => {
  const manager = useContext(managerContext);
  const properties = manager.getOrderedPropertiesSchema();
  const statistics = manager.getPropertyStatistics();
  const t = useI18n();

  if (filterMode !== 'all') {
    const filtered = properties.filter(property => {
      const count = statistics.get(property.id)?.size ?? 0;
      return filterMode === 'in-use' ? count > 0 : count === 0;
    });

    return <CustomPropertyRows properties={filtered} statistics={statistics} />;
  } else {
    const partition = Object.groupBy(properties, p =>
      p.required ? 'required' : p.readonly ? 'readonly' : 'optional'
    );

    return (
      <>
        {partition.required && partition.required.length > 0 ? (
          <>
            <div className={styles.subListHeader}>
              {t[
                'com.affine.settings.workspace.properties.required-properties'
              ]()}
            </div>
            <CustomPropertyRows
              properties={partition.required}
              statistics={statistics}
            />
          </>
        ) : null}

        {partition.optional && partition.optional.length > 0 ? (
          <>
            <div className={styles.subListHeader}>
              {t[
                'com.affine.settings.workspace.properties.general-properties'
              ]()}
            </div>
            <CustomPropertyRows
              properties={partition.optional}
              statistics={statistics}
            />
          </>
        ) : null}

        {partition.readonly && partition.readonly.length > 0 ? (
          <>
            <div className={styles.subListHeader}>
              {t[
                'com.affine.settings.workspace.properties.readonly-properties'
              ]()}
            </div>
            <CustomPropertyRows
              properties={partition.readonly}
              statistics={statistics}
            />
          </>
        ) : null}
      </>
    );
  }
};

const WorkspaceSettingPropertiesMain = () => {
  const t = useI18n();
  const manager = useContext(managerContext);
  const [filterMode, setFilterMode] = useState<PropertyFilterMode>('all');
  const properties = manager.getOrderedPropertiesSchema();
  const filterMenuItems = useMemo(() => {
    const options: MenuItemOption[] = (
      ['all', '-', 'in-use', 'unused'] as const
    ).map(mode => {
      return mode === '-'
        ? '-'
        : {
            text: t[`com.affine.settings.workspace.properties.${mode}`](),
            onClick: () => setFilterMode(mode),
            checked: filterMode === mode,
          };
    });
    return renderMenuItemOptions(options);
  }, [filterMode, t]);

  const onPropertyCreated = useCallback((_e: MouseEvent, id: string) => {
    setTimeout(() => {
      const newRow = document.querySelector<HTMLDivElement>(
        `[data-testid="custom-property-row"][data-property-id="${id}"]`
      );
      if (newRow) {
        newRow.scrollIntoView({ behavior: 'smooth' });
        newRow.dataset.highlight = '';
        setTimeout(() => {
          delete newRow.dataset.highlight;
        }, 3000);
      }
    });
  }, []);
  return (
    <div className={styles.main}>
      <div className={styles.listHeader}>
        {properties.length > 0 ? (
          <Menu items={filterMenuItems}>
            <Button prefix={<FilterIcon />}>
              {filterMode === 'all'
                ? t['com.affine.filter']()
                : t[`com.affine.settings.workspace.properties.${filterMode}`]()}
            </Button>
          </Menu>
        ) : null}
        <Menu
          items={
            <PagePropertiesCreatePropertyMenuItems
              onCreated={onPropertyCreated}
              metaManager={manager}
            />
          }
        >
          <Button variant="primary">
            {t['com.affine.settings.workspace.properties.add_property']()}
          </Button>
        </Menu>
      </div>
      <CustomPropertyRowsList filterMode={filterMode} />
    </div>
  );
};

const WorkspaceSettingPropertiesInner = () => {
  const manager = usePagePropertiesMetaManager();
  return (
    <managerContext.Provider value={manager}>
      <WorkspaceSettingPropertiesMain />
    </managerContext.Provider>
  );
};

export const WorkspaceSettingProperties = ({
  workspaceMetadata,
}: {
  workspaceMetadata: WorkspaceMetadata;
}) => {
  const t = useI18n();
  const workspace = useWorkspace(workspaceMetadata);
  const workspaceInfo = useWorkspaceInfo(workspaceMetadata);
  const title = workspaceInfo?.name || 'untitled';

  if (workspace === null) {
    return null;
  }

  return (
    <FrameworkScope scope={workspace.scope}>
      <SettingHeader
        title={t['com.affine.settings.workspace.properties.header.title']()}
        subtitle={
          <Trans
            values={{
              name: title,
            }}
            i18nKey="com.affine.settings.workspace.properties.header.subtitle"
          >
            Manage workspace <strong>name</strong> properties
          </Trans>
        }
      />
      <WorkspaceSettingPropertiesInner />
    </FrameworkScope>
  );
};
