import { Divider, IconButton } from '@affine/component';
import { generateUniqueNameInSequence } from '@affine/core/utils/unique-name';
import { useI18n } from '@affine/i18n';
import { PlusIcon } from '@blocksuite/icons/rc';
import {
  Content as CollapsibleContent,
  Root as CollapsibleRoot,
} from '@radix-ui/react-collapsible';
import { DocsService, useLiveData, useService } from '@toeverything/infra';
import { useCallback, useState } from 'react';

import { DocPropertyManager } from '../manager';
import {
  DocPropertyTypes,
  isSupportedDocPropertyType,
} from '../types/constant';
import {
  AddDocPropertySidebarSection,
  DocPropertyListSidebarSection,
} from './section';
import * as styles from './styles.css';

export const DocPropertySidebar = () => {
  const t = useI18n();
  const [newPropertyId, setNewPropertyId] = useState<string>();

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
      const newPropertyId = propertyList.createProperty({
        id: typeDefined.uniqueId,
        name,
        type: option.type,
        index: propertyList.indexAt('after'),
      });
      setNewPropertyId(newPropertyId);
    },
    [propertyList, properties]
  );

  return (
    <div className={styles.container}>
      <CollapsibleRoot defaultOpen>
        <DocPropertyListSidebarSection />
        <CollapsibleContent>
          <DocPropertyManager
            className={styles.manager}
            defaultOpenEditMenuPropertyId={newPropertyId}
          />
        </CollapsibleContent>
      </CollapsibleRoot>
      <div className={styles.divider}>
        <Divider />
      </div>
      <CollapsibleRoot defaultOpen>
        <AddDocPropertySidebarSection />
        <CollapsibleContent>
          <div className={styles.AddListContainer}>
            {Object.entries(DocPropertyTypes).map(([key, value]) => {
              const Icon = value.icon;
              const name = t.t(value.name);
              const isUniqueExist = properties.some(
                meta => meta.id === value.uniqueId
              );
              return (
                <div
                  className={styles.itemContainer}
                  key={key}
                  onClick={() => {
                    onAddProperty({
                      type: key,
                      name,
                    });
                  }}
                  data-disabled={isUniqueExist}
                >
                  <Icon className={styles.itemIcon} />
                  <span className={styles.itemName}>{t.t(value.name)}</span>
                  {isUniqueExist ? (
                    <span className={styles.itemAdded}>Added</span>
                  ) : (
                    <IconButton size={20} iconClassName={styles.itemAdd}>
                      <PlusIcon />
                    </IconButton>
                  )}
                </div>
              );
            })}
          </div>
        </CollapsibleContent>
      </CollapsibleRoot>
    </div>
  );
};
