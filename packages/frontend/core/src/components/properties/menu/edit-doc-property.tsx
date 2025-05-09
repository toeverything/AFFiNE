import {
  Input,
  MenuItem,
  MenuSeparator,
  useConfirmModal,
} from '@affine/component';
import type { DocCustomPropertyInfo } from '@affine/core/modules/db';
import { WorkspacePropertyService } from '@affine/core/modules/workspace-property';
import { Trans, useI18n } from '@affine/i18n';
import { DeleteIcon, InvisibleIcon, ViewIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import {
  type KeyboardEventHandler,
  type MouseEvent,
  useCallback,
  useEffect,
  useState,
} from 'react';

import {
  isSupportedWorkspacePropertyType,
  WorkspacePropertyTypes,
} from '../../workspace-property-types';
import { WorkspacePropertyIconSelector } from '../icons/icons-selector';
import { WorkspacePropertyIcon } from '../icons/workspace-property-icon';
import * as styles from './edit-doc-property.css';

export const EditWorkspacePropertyMenuItems = ({
  propertyId,
  onPropertyInfoChange,
  readonly,
}: {
  propertyId: string;
  readonly?: boolean;
  onPropertyInfoChange?: (
    field: keyof DocCustomPropertyInfo,
    value: string
  ) => void;
}) => {
  const t = useI18n();
  const workspacePropertyService = useService(WorkspacePropertyService);
  const propertyInfo = useLiveData(
    workspacePropertyService.propertyInfo$(propertyId)
  );
  const propertyType = propertyInfo?.type;
  const typeInfo =
    propertyType && isSupportedWorkspacePropertyType(propertyType)
      ? WorkspacePropertyTypes[propertyType]
      : undefined;
  const propertyName =
    propertyInfo?.name ||
    (typeInfo?.name ? t.t(typeInfo.name) : t['unnamed']());
  const [name, setName] = useState(propertyName);
  const confirmModal = useConfirmModal();

  useEffect(() => {
    setName(propertyName);
  }, [propertyName]);

  const onKeyDown: KeyboardEventHandler<HTMLInputElement> = useCallback(
    e => {
      if (e.key !== 'Escape') {
        e.stopPropagation();
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        workspacePropertyService.updatePropertyInfo(propertyId, {
          name: e.currentTarget.value,
        });
      }
    },
    [workspacePropertyService, propertyId]
  );
  const handleBlur = useCallback(
    (e: FocusEvent & { currentTarget: HTMLInputElement }) => {
      workspacePropertyService.updatePropertyInfo(propertyId, {
        name: e.currentTarget.value,
      });
      onPropertyInfoChange?.('name', e.currentTarget.value);
    },
    [workspacePropertyService, propertyId, onPropertyInfoChange]
  );

  const handleIconChange = useCallback(
    (iconName: string) => {
      workspacePropertyService.updatePropertyInfo(propertyId, {
        icon: iconName,
      });
      onPropertyInfoChange?.('icon', iconName);
    },
    [workspacePropertyService, propertyId, onPropertyInfoChange]
  );

  const handleNameChange = useCallback((e: string) => {
    setName(e);
  }, []);

  const handleClickAlwaysShow = useCallback(
    (e: MouseEvent) => {
      e.preventDefault(); // avoid radix-ui close the menu
      workspacePropertyService.updatePropertyInfo(propertyId, {
        show: 'always-show',
      });
      onPropertyInfoChange?.('show', 'always-show');
    },
    [workspacePropertyService, propertyId, onPropertyInfoChange]
  );

  const handleClickHideWhenEmpty = useCallback(
    (e: MouseEvent) => {
      e.preventDefault(); // avoid radix-ui close the menu
      workspacePropertyService.updatePropertyInfo(propertyId, {
        show: 'hide-when-empty',
      });
      onPropertyInfoChange?.('show', 'hide-when-empty');
    },
    [workspacePropertyService, propertyId, onPropertyInfoChange]
  );

  const handleClickAlwaysHide = useCallback(
    (e: MouseEvent) => {
      e.preventDefault(); // avoid radix-ui close the menu
      workspacePropertyService.updatePropertyInfo(propertyId, {
        show: 'always-hide',
      });
      onPropertyInfoChange?.('show', 'always-hide');
    },
    [workspacePropertyService, propertyId, onPropertyInfoChange]
  );

  if (!propertyInfo || !isSupportedWorkspacePropertyType(propertyType)) {
    return null;
  }

  return (
    <>
      <div
        className={
          BUILD_CONFIG.isMobileEdition
            ? styles.mobilePropertyRowNamePopupRow
            : styles.propertyRowNamePopupRow
        }
        data-testid="edit-property-menu-item"
      >
        <WorkspacePropertyIconSelector
          propertyInfo={propertyInfo}
          readonly={readonly}
          onSelectedChange={handleIconChange}
        />
        {typeInfo?.renameable === false || readonly ? (
          <span className={styles.propertyName}>{name}</span>
        ) : (
          <Input
            value={name}
            onBlur={handleBlur}
            onChange={handleNameChange}
            placeholder={t['unnamed']()}
            onKeyDown={onKeyDown}
            size="large"
            style={{ borderRadius: 4, height: 30 }}
          />
        )}
      </div>
      <div
        className={
          BUILD_CONFIG.isMobileEdition
            ? styles.mobilePropertyRowTypeItem
            : styles.propertyRowTypeItem
        }
      >
        {t['com.affine.page-properties.create-property.menu.header']()}
        <div className={styles.propertyTypeName}>
          <WorkspacePropertyIcon propertyInfo={propertyInfo} />
          {t[`com.affine.page-properties.property.${propertyType}`]()}
        </div>
      </div>
      <MenuSeparator />
      <MenuItem
        prefixIcon={<ViewIcon />}
        onClick={handleClickAlwaysShow}
        selected={
          propertyInfo.show !== 'hide-when-empty' &&
          propertyInfo.show !== 'always-hide'
        }
        data-property-visibility="always-show"
        disabled={readonly}
      >
        {t['com.affine.page-properties.property.always-show']()}
      </MenuItem>
      <MenuItem
        prefixIcon={<InvisibleIcon />}
        onClick={handleClickHideWhenEmpty}
        selected={propertyInfo.show === 'hide-when-empty'}
        data-property-visibility="hide-when-empty"
        disabled={readonly}
      >
        {t['com.affine.page-properties.property.hide-when-empty']()}
      </MenuItem>
      <MenuItem
        prefixIcon={<InvisibleIcon />}
        onClick={handleClickAlwaysHide}
        selected={propertyInfo.show === 'always-hide'}
        data-property-visibility="always-hide"
        disabled={readonly}
      >
        {t['com.affine.page-properties.property.always-hide']()}
      </MenuItem>
      <MenuSeparator />
      <MenuItem
        prefixIcon={<DeleteIcon />}
        type="danger"
        disabled={readonly}
        onClick={() => {
          confirmModal.openConfirmModal({
            title:
              t['com.affine.settings.workspace.properties.delete-property'](),
            description: (
              <Trans
                values={{
                  name: name,
                }}
                i18nKey="com.affine.settings.workspace.properties.delete-property-desc"
              >
                The <strong>{{ name: name } as any}</strong> property will be
                removed from count doc(s). This action cannot be undone.
              </Trans>
            ),
            confirmText: t['Confirm'](),
            onConfirm: () => {
              workspacePropertyService.removeProperty(propertyId);
            },
            confirmButtonOptions: {
              variant: 'error',
            },
          });
        }}
      >
        {t['com.affine.settings.workspace.properties.delete-property']()}
      </MenuItem>
    </>
  );
};
