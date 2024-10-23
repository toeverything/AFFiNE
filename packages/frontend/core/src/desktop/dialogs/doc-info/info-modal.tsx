import { Button, Divider, Menu, PropertyCollapsible } from '@affine/component';
import { CreatePropertyMenuItems } from '@affine/core/components/doc-properties/menu/create-doc-property';
import { DocPropertyRow } from '@affine/core/components/doc-properties/table';
import { DocsSearchService } from '@affine/core/modules/docs-search';
import { useI18n } from '@affine/i18n';
import { PlusIcon } from '@blocksuite/icons/rc';
import {
  DocsService,
  LiveData,
  useLiveData,
  useServices,
} from '@toeverything/infra';
import { useMemo, useState } from 'react';

import * as styles from './info-modal.css';
import { LinksRow } from './links-row';
import { TimeRow } from './time-row';

export const InfoTable = ({
  onClose,
  docId,
}: {
  docId: string;
  onClose: () => void;
}) => {
  const t = useI18n();
  const { docsSearchService, docsService } = useServices({
    DocsSearchService,
    DocsService,
  });
  const [newPropertyId, setNewPropertyId] = useState<string | null>(null);
  const properties = useLiveData(docsService.propertyList.sortedProperties$);
  const links = useLiveData(
    useMemo(
      () => LiveData.from(docsSearchService.watchRefsFrom(docId), null),
      [docId, docsSearchService]
    )
  );
  const backlinks = useLiveData(
    useMemo(
      () => LiveData.from(docsSearchService.watchRefsTo(docId), null),
      [docId, docsSearchService]
    )
  );

  return (
    <div>
      <TimeRow className={styles.timeRow} docId={docId} />
      <Divider size="thinner" />
      {backlinks && backlinks.length > 0 ? (
        <>
          <LinksRow
            references={backlinks}
            onClick={onClose}
            label={t['com.affine.page-properties.backlinks']()}
          />
          <Divider size="thinner" />
        </>
      ) : null}
      {links && links.length > 0 ? (
        <>
          <LinksRow
            references={links}
            onClick={onClose}
            label={t['com.affine.page-properties.outgoing-links']()}
          />
          <Divider size="thinner" />
        </>
      ) : null}
      <PropertyCollapsible
        className={styles.tableBodyRoot}
        collapseButtonText={({ hide, isCollapsed }) =>
          isCollapsed
            ? hide === 1
              ? t['com.affine.page-properties.more-property.one']({
                  count: hide.toString(),
                })
              : t['com.affine.page-properties.more-property.more']({
                  count: hide.toString(),
                })
            : hide === 1
              ? t['com.affine.page-properties.hide-property.one']({
                  count: hide.toString(),
                })
              : t['com.affine.page-properties.hide-property.more']({
                  count: hide.toString(),
                })
        }
      >
        {properties.map(property => (
          <DocPropertyRow
            key={property.id}
            propertyInfo={property}
            defaultOpenEditMenu={newPropertyId === property.id}
          />
        ))}
        <Menu
          items={<CreatePropertyMenuItems onCreated={setNewPropertyId} />}
          contentOptions={{
            onClick(e) {
              e.stopPropagation();
            },
          }}
        >
          <Button
            variant="plain"
            prefix={<PlusIcon />}
            className={styles.addPropertyButton}
          >
            {t['com.affine.page-properties.add-property']()}
          </Button>
        </Menu>
      </PropertyCollapsible>
    </div>
  );
};
