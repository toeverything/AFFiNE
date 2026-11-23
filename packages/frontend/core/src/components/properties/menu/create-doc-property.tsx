import { MenuItem, MenuSeparator } from '@affine/component';
import type { DocCustomPropertyInfo } from '@affine/core/modules/db';
import {
  WorkspacePropertyService,
  type WorkspacePropertyType,
} from '@affine/core/modules/workspace-property';
import { generateUniqueNameInSequence } from '@affine/core/utils/unique-name';
import { useI18n } from '@affine/i18n';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback } from 'react';

import {
  isSupportedWorkspacePropertyType,
  WorkspacePropertyTypes,
} from '../../workspace-property-types';
import * as styles from './create-doc-property.css';

export const CreatePropertyMenuItems = ({
  at = 'before',
  onCreated,
}: {
  at?: 'before' | 'after';
  onCreated?: (property: DocCustomPropertyInfo) => void;
}) => {
  const t = useI18n();
  const workspacePropertyService = useService(WorkspacePropertyService);
  const properties = useLiveData(workspacePropertyService.properties$);

  const onAddProperty = useCallback(
    (option: { type: WorkspacePropertyType; name: string }) => {
      if (!isSupportedWorkspacePropertyType(option.type)) {
        return;
      }
      const typeDefined = WorkspacePropertyTypes[option.type];
      const nameExists = properties.some(meta => meta.name === option.name);
      const allNames = properties
        .map(meta => meta.name)
        .filter((name): name is string => name !== null && name !== undefined);
      const name = nameExists
        ? generateUniqueNameInSequence(option.name, allNames)
        : option.name;
      const uniqueId = typeDefined.uniqueId;
      const newProperty = workspacePropertyService.createProperty({
        id: uniqueId,
        name,
        type: option.type,
        index: workspacePropertyService.indexAt(at),
        isDeleted: false,
      });
      onCreated?.(newProperty);
    },
    [at, onCreated, workspacePropertyService, properties]
  );

  return (
    <>
      <div role="heading" className={styles.menuHeader}>
        {t['com.affine.page-properties.create-property.menu.header']()}
      </div>
      <MenuSeparator />
      {Object.entries(WorkspacePropertyTypes).map(([type, info]) => {
        const name = t.t(info.name);
        const uniqueId = info.uniqueId;
        const isUniqueExist = properties.some(meta => meta.id === uniqueId);
        const Icon = info.icon;
        return (
          <MenuItem
            key={type}
            prefixIcon={<Icon />}
            disabled={isUniqueExist}
            onClick={() => {
              onAddProperty({
                name: name,
                type: type as WorkspacePropertyType,
              });
            }}
            data-testid="create-property-menu-item"
            data-property-type={type}
          >
            <div className={styles.propertyItem}>
              {name}
              {isUniqueExist && (
                <span>
                  {t['com.affine.page-properties.create-property.added']()}
                </span>
              )}
            </div>
          </MenuItem>
        );
      })}
    </>
  );
};
