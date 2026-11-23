import {
  Button,
  IconButton,
  Menu,
  MenuItem,
  MenuSeparator,
} from '@affine/component';
import type { FilterParams } from '@affine/core/modules/collection-rules';
import { WorkspacePropertyService } from '@affine/core/modules/workspace-property';
import { useI18n } from '@affine/i18n';
import {
  ArrowLeftBigIcon,
  CloudWorkspaceIcon,
  FavoriteIcon,
  PlusIcon,
} from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import { useMemo } from 'react';

import { generateExplorerPropertyList } from '../explorer/properties';
import { WorkspacePropertyIcon, WorkspacePropertyName } from '../properties';
import { WorkspacePropertyTypes } from '../workspace-property-types';
import * as styles from './styles.css';

export const AddFilterMenu = ({
  onAdd,
  onBack,
}: {
  onAdd: (params: FilterParams) => void;
  onBack?: () => void;
}) => {
  const t = useI18n();
  const workspacePropertyService = useService(WorkspacePropertyService);
  const workspaceProperties = useLiveData(
    workspacePropertyService.sortedProperties$
  );
  const explorerPropertyList = useMemo(
    () => generateExplorerPropertyList(workspaceProperties),
    [workspaceProperties]
  );

  return (
    <>
      <div className={styles.selectHeaderContainer}>
        {onBack && (
          <IconButton onClick={onBack}>
            <ArrowLeftBigIcon />
          </IconButton>
        )}
        <div className={styles.variableSelectTitleStyle}>
          {t['com.affine.filter']()}
        </div>
      </div>

      <MenuSeparator />
      <MenuItem
        prefixIcon={<FavoriteIcon className={styles.filterTypeItemIcon} />}
        key={'favorite'}
        onClick={() => {
          onAdd({
            type: 'system',
            key: 'favorite',
            method: 'is',
            value: 'true',
          });
        }}
      >
        <span className={styles.filterTypeItemName}>{t['Favorited']()}</span>
      </MenuItem>
      <MenuItem
        prefixIcon={
          <CloudWorkspaceIcon className={styles.filterTypeItemIcon} />
        }
        key={'shared'}
        onClick={() => {
          onAdd({
            type: 'system',
            key: 'shared',
            method: 'is',
            value: 'true',
          });
        }}
      >
        <span className={styles.filterTypeItemName}>
          {t['com.affine.filter.is-public']()}
        </span>
      </MenuItem>
      {explorerPropertyList.map(({ systemProperty, workspaceProperty }) => {
        if (systemProperty) {
          const defaultFilter =
            'defaultFilter' in systemProperty && systemProperty.defaultFilter;
          if (!defaultFilter) {
            return null;
          }
          return (
            <MenuItem
              prefixIcon={
                <systemProperty.icon className={styles.filterTypeItemIcon} />
              }
              key={systemProperty.type}
              onClick={() => {
                onAdd({
                  type: 'system',
                  key: systemProperty.type,
                  ...defaultFilter,
                });
              }}
            >
              <span className={styles.filterTypeItemName}>
                {t.t(systemProperty.name)}
              </span>
            </MenuItem>
          );
        } else if (workspaceProperty) {
          const type = WorkspacePropertyTypes[workspaceProperty.type];
          const defaultFilter = type?.defaultFilter;
          if (!defaultFilter) {
            return null;
          }
          return (
            <MenuItem
              prefixIcon={
                <WorkspacePropertyIcon
                  propertyInfo={workspaceProperty}
                  className={styles.filterTypeItemIcon}
                />
              }
              key={workspaceProperty.id}
              onClick={() => {
                onAdd({
                  type: 'property',
                  key: workspaceProperty.id,
                  ...defaultFilter,
                });
              }}
            >
              <span className={styles.filterTypeItemName}>
                <WorkspacePropertyName propertyInfo={workspaceProperty} />
              </span>
            </MenuItem>
          );
        }
        return null;
      })}
    </>
  );
};

export const AddFilter = ({
  onAdd,
  variant = 'icon-button',
}: {
  onAdd: (params: FilterParams) => void;
  variant?: 'icon-button' | 'button';
}) => {
  const t = useI18n();
  return (
    <Menu
      items={<AddFilterMenu onAdd={onAdd} />}
      contentOptions={{
        className: styles.addFilterMenuContent,
      }}
    >
      {variant === 'icon-button' ? (
        <IconButton size="16">
          <PlusIcon />
        </IconButton>
      ) : (
        <Button prefix={<PlusIcon />} className={styles.addFilterButton}>
          {t['com.affine.filter.add-filter']()}
        </Button>
      )}
    </Menu>
  );
};
