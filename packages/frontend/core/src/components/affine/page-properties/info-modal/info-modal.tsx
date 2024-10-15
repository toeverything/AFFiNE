import {
  Button,
  Divider,
  type InlineEditHandle,
  Menu,
  Modal,
  PropertyCollapsible,
  Scrollable,
} from '@affine/component';
import { DocInfoService } from '@affine/core/modules/doc-info';
import { DocsSearchService } from '@affine/core/modules/docs-search';
import { useI18n } from '@affine/i18n';
import { PlusIcon } from '@blocksuite/icons/rc';
import type { Doc } from '@toeverything/infra';
import {
  DocsService,
  FrameworkScope,
  LiveData,
  useLiveData,
  useService,
  useServices,
} from '@toeverything/infra';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { BlocksuiteHeaderTitle } from '../../../blocksuite/block-suite-header/title';
import { CreatePropertyMenuItems } from '../menu/create-doc-property';
import { PagePropertyRow } from '../table';
import * as styles from './info-modal.css';
import { LinksRow } from './links-row';
import { TimeRow } from './time-row';

export const InfoModal = () => {
  const modal = useService(DocInfoService).modal;
  const docId = useLiveData(modal.docId$);
  const docsService = useService(DocsService);

  const [doc, setDoc] = useState<Doc | null>(null);
  useEffect(() => {
    if (!docId) return;
    const docRef = docsService.open(docId);
    setDoc(docRef.doc);
    return () => {
      docRef.release();
      setDoc(null);
    };
  }, [docId, docsService]);

  if (!doc || !docId) return null;

  return (
    <FrameworkScope scope={doc.scope}>
      <InfoModalOpened docId={docId} />
    </FrameworkScope>
  );
};

const InfoModalOpened = ({ docId }: { docId: string }) => {
  const modal = useService(DocInfoService).modal;

  const titleInputHandleRef = useRef<InlineEditHandle>(null);
  const handleClose = useCallback(() => {
    modal.close();
  }, [modal]);

  return (
    <Modal
      contentOptions={{
        className: styles.container,
      }}
      open
      onOpenChange={v => modal.onOpenChange(v)}
      withoutCloseButton
    >
      <Scrollable.Root>
        <Scrollable.Viewport
          className={styles.viewport}
          data-testid="info-modal"
        >
          <div className={styles.titleContainer} data-testid="info-modal-title">
            <BlocksuiteHeaderTitle
              docId={docId}
              className={styles.titleStyle}
              inputHandleRef={titleInputHandleRef}
            />
          </div>
          <InfoTable docId={docId} onClose={handleClose} />
        </Scrollable.Viewport>
        <Scrollable.Scrollbar className={styles.scrollBar} />
      </Scrollable.Root>
    </Modal>
  );
};

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
          <PagePropertyRow
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
