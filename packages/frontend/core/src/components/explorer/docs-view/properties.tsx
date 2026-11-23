import type { DocCustomPropertyInfo } from '@affine/core/modules/db';
import { type DocRecord, DocsService } from '@affine/core/modules/doc';
import { WorkspacePropertyService } from '@affine/core/modules/workspace-property';
import { useLiveData, useService } from '@toeverything/infra';
import clsx from 'clsx';
import { useContext, useMemo } from 'react';

import { SystemPropertyTypes } from '../../system-property-types';
import { WorkspacePropertyTypes } from '../../workspace-property-types';
import { DocExplorerContext } from '../context';
import { generateExplorerPropertyList } from '../properties';
import { listHide560, listHide750 } from './doc-list-item.css';
import * as styles from './properties.css';

const listInlinePropertyOrder: string[] = [
  'createdAt',
  'updatedAt',
  'createdBy',
  'updatedBy',
];
const cardInlinePropertyOrder: string[] = [
  'createdBy',
  'updatedBy',
  'createdAt',
  'updatedAt',
];

const useProperties = (view: 'list' | 'card') => {
  const workspacePropertyService = useService(WorkspacePropertyService);

  const propertyList = useLiveData(workspacePropertyService.sortedProperties$);

  const explorerPropertyList = useMemo(() => {
    return generateExplorerPropertyList(propertyList);
  }, [propertyList]);

  const stackProperties = useMemo(
    () =>
      explorerPropertyList
        .filter(
          property =>
            (property.systemProperty &&
              property.systemProperty.showInDocList === 'stack') ||
            (property.workspaceProperty &&
              WorkspacePropertyTypes[property.workspaceProperty.type]
                .showInDocList === 'stack')
        )
        .filter(p => p.systemProperty?.type !== 'tags'),
    [explorerPropertyList]
  );

  const inlineProperties = useMemo(
    () =>
      explorerPropertyList
        .filter(
          property =>
            (property.systemProperty &&
              property.systemProperty.showInDocList === 'inline') ||
            (property.workspaceProperty &&
              WorkspacePropertyTypes[property.workspaceProperty.type]
                .showInDocList === 'inline')
        )
        .filter(p => p.systemProperty?.type !== 'tags')
        .sort((a, b) => {
          const orderList =
            view === 'list' ? listInlinePropertyOrder : cardInlinePropertyOrder;
          const aIndex = orderList.indexOf(
            a.systemProperty?.type ?? a.workspaceProperty?.type ?? ''
          );
          const bIndex = orderList.indexOf(
            b.systemProperty?.type ?? b.workspaceProperty?.type ?? ''
          );
          // Push un-recognised types to the tail instead of the head
          return (
            (aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex) -
            (bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex)
          );
        }),
    [explorerPropertyList, view]
  );

  return useMemo(
    () => ({
      stackProperties,
      inlineProperties,
    }),
    [stackProperties, inlineProperties]
  );
};
export const ListViewProperties = ({ docId }: { docId: string }) => {
  const contextValue = useContext(DocExplorerContext);
  const displayProperties = useLiveData(contextValue?.displayProperties$);
  const docsService = useService(DocsService);
  const doc = useLiveData(docsService.list.doc$(docId));

  const { stackProperties, inlineProperties } = useProperties('list');

  if (!doc) {
    return null;
  }

  return (
    <>
      {/* stack properties */}
      <div className={clsx(styles.stackContainer, listHide750)}>
        <div className={styles.stackProperties}>
          {stackProperties.map(({ systemProperty, workspaceProperty }) => {
            const displayKey = systemProperty
              ? `system:${systemProperty.type}`
              : workspaceProperty
                ? `property:${workspaceProperty.id}`
                : null;
            if (!displayKey || !displayProperties?.includes(displayKey)) {
              return null;
            }
            if (systemProperty && systemProperty.showInDocList) {
              return (
                <SystemPropertyRenderer
                  doc={doc}
                  config={SystemPropertyTypes[systemProperty.type]}
                  key={systemProperty.type}
                />
              );
            } else if (
              workspaceProperty &&
              WorkspacePropertyTypes[workspaceProperty.type]?.showInDocList
            ) {
              return (
                <WorkspacePropertyRenderer
                  key={workspaceProperty.id}
                  doc={doc}
                  property={workspaceProperty}
                  config={WorkspacePropertyTypes[workspaceProperty.type]}
                />
              );
            }
            return null;
          })}
        </div>
        {displayProperties?.includes('system:tags') ? (
          <div className={styles.stackProperties}>
            <SystemPropertyRenderer
              doc={doc}
              config={SystemPropertyTypes.tags}
            />
          </div>
        ) : null}
      </div>
      {/* inline properties */}
      {inlineProperties.map(({ systemProperty, workspaceProperty }) => {
        const displayKeys = [
          systemProperty ? `system:${systemProperty.type}` : null,
          workspaceProperty ? `property:${workspaceProperty.id}` : null,
        ];
        if (!displayKeys.some(key => key && displayProperties?.includes(key))) {
          return null;
        }
        if (systemProperty) {
          return (
            <SystemPropertyRenderer
              doc={doc}
              config={SystemPropertyTypes[systemProperty.type]}
              key={systemProperty.type}
            />
          );
        } else if (workspaceProperty) {
          return (
            <div
              key={workspaceProperty.id}
              className={clsx(styles.inlineProperty, listHide560)}
            >
              <WorkspacePropertyRenderer
                doc={doc}
                property={workspaceProperty}
                config={WorkspacePropertyTypes[workspaceProperty.type]}
              />
            </div>
          );
        }
        return null;
      })}
    </>
  );
};

export const CardViewProperties = ({ docId }: { docId: string }) => {
  const contextValue = useContext(DocExplorerContext);
  const displayProperties = useLiveData(contextValue?.displayProperties$);
  const docsService = useService(DocsService);
  const doc = useLiveData(docsService.list.doc$(docId));

  const { stackProperties, inlineProperties } = useProperties('card');

  if (!doc) {
    return null;
  }

  return (
    <div className={styles.cardProperties}>
      {/* inline properties */}
      {inlineProperties.map(({ systemProperty, workspaceProperty }) => {
        const displayKeys = [
          systemProperty ? `system:${systemProperty.type}` : null,
          workspaceProperty ? `property:${workspaceProperty.id}` : null,
        ];
        if (!displayKeys.some(key => key && displayProperties?.includes(key))) {
          return null;
        }
        if (systemProperty) {
          return (
            <SystemPropertyRenderer
              doc={doc}
              config={SystemPropertyTypes[systemProperty.type]}
              key={systemProperty.type}
            />
          );
        } else if (workspaceProperty) {
          return (
            <div key={workspaceProperty.id} className={styles.inlineProperty}>
              <WorkspacePropertyRenderer
                doc={doc}
                property={workspaceProperty}
                config={WorkspacePropertyTypes[workspaceProperty.type]}
              />
            </div>
          );
        }
        return null;
      })}
      {/* stack properties */}
      {stackProperties.map(({ systemProperty, workspaceProperty }) => {
        const displayKeys = [
          systemProperty ? `system:${systemProperty.type}` : null,
          workspaceProperty ? `property:${workspaceProperty.id}` : null,
        ];
        if (!displayKeys.some(key => key && displayProperties?.includes(key))) {
          return null;
        }
        if (systemProperty) {
          return (
            <SystemPropertyRenderer
              doc={doc}
              config={SystemPropertyTypes[systemProperty.type]}
              key={systemProperty.type}
            />
          );
        } else if (workspaceProperty) {
          return (
            <WorkspacePropertyRenderer
              key={workspaceProperty.id}
              doc={doc}
              property={workspaceProperty}
              config={WorkspacePropertyTypes[workspaceProperty.type]}
            />
          );
        }
        return null;
      })}
      {displayProperties?.includes('system:tags') ? (
        <SystemPropertyRenderer doc={doc} config={SystemPropertyTypes.tags} />
      ) : null}
    </div>
  );
};

const SystemPropertyRenderer = ({
  doc,
  config,
}: {
  doc: DocRecord;
  config: (typeof SystemPropertyTypes)[string];
}) => {
  if (!config.docListProperty) {
    return null;
  }

  return <config.docListProperty doc={doc} />;
};

const WorkspacePropertyRenderer = ({
  property,
  doc,
  config,
}: {
  property: DocCustomPropertyInfo;
  doc: DocRecord;
  config: (typeof WorkspacePropertyTypes)[keyof typeof WorkspacePropertyTypes];
}) => {
  const customPropertyValue = useLiveData(doc.customProperty$(property.id));
  if (!config.docListProperty) {
    return null;
  }

  return (
    <config.docListProperty
      value={customPropertyValue}
      doc={doc}
      propertyInfo={property}
    />
  );
};
