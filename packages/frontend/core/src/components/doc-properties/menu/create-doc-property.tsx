import { MenuItem, MenuSeparator } from '@affine/component';
import { generateUniqueNameInSequence } from '@affine/core/utils/unique-name';
import { useI18n } from '@affine/i18n';
import { DocsService, useLiveData, useService } from '@toeverything/infra';
import { useCallback } from 'react';

import {
  DocPropertyTypes,
  isSupportedDocPropertyType,
} from '../types/constant';
import * as styles from './create-doc-property.css';

export const CreatePropertyMenuItems = ({
  at = 'before',
  onCreated,
}: {
  at?: 'before' | 'after';
  onCreated?: (propertyId: string) => void;
}) => {
  const t = useI18n();
  const docsService = useService(DocsService);
  const propertyList = docsService.propertyList;
  const properties = useLiveData(propertyList.properties$);

  const onAddProperty = useCallback(
    (option: { type: string; name: string }) => {
      if (!isSupportedDocPropertyType(option.type)) {
        return;
      }
      const typeDefined = DocPropertyTypes[option.type];
      const nameExists = properties.some(meta => meta.name === option.name);
      const allNames = properties
        .map(meta => meta.name)
        .filter((name): name is string => name !== null && name !== undefined);
      const name = nameExists
        ? generateUniqueNameInSequence(option.name, allNames)
        : option.name;
      const uniqueId = typeDefined.uniqueId;
      const newPropertyId = propertyList.createProperty({
        id: uniqueId,
        name,
        type: option.type,
        index: propertyList.indexAt(at),
      });
      onCreated?.(newPropertyId);
    },
    [at, onCreated, propertyList, properties]
  );

  return (
    <>
      <div role="heading" className={styles.menuHeader}>
        {t['com.affine.page-properties.create-property.menu.header']()}
      </div>
      <MenuSeparator />
      {Object.entries(DocPropertyTypes).map(([type, info]) => {
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
                type: type,
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
