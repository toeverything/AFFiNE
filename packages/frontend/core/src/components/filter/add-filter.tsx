import { IconButton, Menu, MenuItem, MenuSeparator } from '@affine/component';
import type { FilterParams } from '@affine/core/modules/collection-rules';
import { WorkspacePropertyService } from '@affine/core/modules/workspace-property';
import { useI18n } from '@affine/i18n';
import { ArrowLeftBigIcon, FavoriteIcon, PlusIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';

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
  const workspaceProperties = useLiveData(workspacePropertyService.properties$);

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
        prefixIcon={<FavoriteIcon className={styles.filterTypeItemIcon} />}
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
      {workspaceProperties.map(property => {
        const type = WorkspacePropertyTypes[property.type];
        const defaultFilter = type?.defaultFilter;
        if (!defaultFilter) {
          return null;
        }
        return (
          <MenuItem
            prefixIcon={
              <WorkspacePropertyIcon
                propertyInfo={property}
                className={styles.filterTypeItemIcon}
              />
            }
            key={property.id}
            onClick={() => {
              onAdd({
                type: 'property',
                key: property.id,
                ...defaultFilter,
              });
            }}
          >
            <span className={styles.filterTypeItemName}>
              <WorkspacePropertyName propertyInfo={property} />
            </span>
          </MenuItem>
        );
      })}
    </>
  );
};

export const AddFilter = ({
  onAdd,
}: {
  onAdd: (params: FilterParams) => void;
}) => {
  return (
    <Menu
      items={<AddFilterMenu onAdd={onAdd} />}
      contentOptions={{
        className: styles.addFilterMenuContent,
      }}
    >
      <IconButton size="16">
        <PlusIcon />
      </IconButton>
    </Menu>
  );
};
