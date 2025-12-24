import { Divider, IconButton, Tooltip } from '@affine/component';
import type { DocCustomPropertyInfo } from '@affine/core/modules/db';
import {
  WorkspacePropertyService,
  type WorkspacePropertyType,
} from '@affine/core/modules/workspace-property';
import { generateUniqueNameInSequence } from '@affine/core/utils/unique-name';
import { useI18n } from '@affine/i18n';
import track from '@affine/track';
import { PlusIcon } from '@blocksuite/icons/rc';
import {
  Content as CollapsibleContent,
  Root as CollapsibleRoot,
} from '@radix-ui/react-collapsible';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback, useState } from 'react';

import { useGuard } from '../../guard';
import {
  isSupportedWorkspacePropertyType,
  WorkspacePropertyTypes,
} from '../../workspace-property-types';
import { WorkspacePropertyManager } from '../manager';
import {
  AddWorkspacePropertySidebarSection,
  WorkspacePropertyListSidebarSection,
} from './section';
import * as styles from './styles.css';

export const WorkspacePropertySidebar = () => {
  const t = useI18n();
  const [newPropertyId, setNewPropertyId] = useState<string>();

  const workspacePropertyService = useService(WorkspacePropertyService);
  const properties = useLiveData(workspacePropertyService.properties$);
  const canEditPropertyInfo = useGuard('Workspace_Properties_Update');
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
      const newProperty = workspacePropertyService.createProperty({
        id: typeDefined.uniqueId,
        name,
        type: option.type,
        index: workspacePropertyService.indexAt('after'),
        isDeleted: false,
      });
      setNewPropertyId(newProperty.id);
      track.doc.sidepanel.property.addProperty({
        control: 'property list',
        type: option.type,
      });
    },
    [workspacePropertyService, properties]
  );

  const onPropertyInfoChange = useCallback(
    (property: DocCustomPropertyInfo, field: string) => {
      track.doc.sidepanel.property.editPropertyMeta({
        type: property.type,
        field,
      });
    },
    []
  );

  return (
    <div className={styles.container}>
      <CollapsibleRoot defaultOpen>
        <WorkspacePropertyListSidebarSection />
        <CollapsibleContent>
          <WorkspacePropertyManager
            className={styles.manager}
            defaultOpenEditMenuPropertyId={newPropertyId}
            onPropertyInfoChange={onPropertyInfoChange}
          />
        </CollapsibleContent>
      </CollapsibleRoot>
      <div className={styles.divider}>
        <Divider />
      </div>
      <CollapsibleRoot defaultOpen>
        <AddWorkspacePropertySidebarSection />
        <CollapsibleContent>
          <div className={styles.AddListContainer}>
            {Object.entries(WorkspacePropertyTypes).map(([key, value]) => {
              const Icon = value.icon;
              const name = t.t(value.name);
              const isUniqueExist = properties.some(
                meta => meta.id === value.uniqueId
              );
              return (
                <Tooltip
                  key={key}
                  content={t.t(value.description || value.name)}
                  side="left"
                >
                  <div
                    className={styles.itemContainer}
                    onClick={() => {
                      if (!canEditPropertyInfo) {
                        return;
                      }
                      onAddProperty({
                        type: key as WorkspacePropertyType,
                        name,
                      });
                    }}
                    data-disabled={isUniqueExist || !canEditPropertyInfo}
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
                </Tooltip>
              );
            })}
          </div>
        </CollapsibleContent>
      </CollapsibleRoot>
    </div>
  );
};
