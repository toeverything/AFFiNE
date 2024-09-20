import {
  Divider,
  type InlineEditHandle,
  Modal,
  Scrollable,
} from '@affine/component';
import { DocsSearchService } from '@affine/core/modules/docs-search';
import { useI18n } from '@affine/i18n';
import {
  LiveData,
  useLiveData,
  useMount,
  useServices,
} from '@toeverything/infra';
import {
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { BlocksuiteHeaderTitle } from '../../../blocksuite/block-suite-header/title';
import { managerContext } from '../common';
import {
  PagePropertiesAddProperty,
  PagePropertyRow,
  SortableProperties,
  usePagePropertiesManager,
} from '../table';
import * as styles from './info-modal.css';
import { LinksRow } from './links-row';
import { TagsRow } from './tags-row';
import { TimeRow } from './time-row';

export const useInfoModal = (docId?: string) => {
  const [open, setOpen] = useState(false);
  const { mount } = useMount('InfoModal');

  useEffect(() => {
    if (!open || !docId) return;
    return mount(<InfoModal open docId={docId} onOpenChange={setOpen} />);
  }, [docId, mount, open]);

  return [open, setOpen] as const;
};

/**
 * For most situations, use `useInfoModal()` instead.
 */
export const InfoModal = ({
  open,
  onOpenChange,
  docId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  docId: string;
}) => {
  const titleInputHandleRef = useRef<InlineEditHandle>(null);
  const manager = usePagePropertiesManager(docId);
  const handleClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  if (!manager.page || manager.readonly) {
    return null;
  }

  return (
    <Modal
      contentOptions={{
        className: styles.container,
      }}
      open={open}
      onOpenChange={onOpenChange}
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
          <managerContext.Provider value={manager}>
            <Suspense>
              <InfoTable
                docId={docId}
                onClose={handleClose}
                readonly={manager.readonly}
              />
            </Suspense>
          </managerContext.Provider>
        </Scrollable.Viewport>
        <Scrollable.Scrollbar className={styles.scrollBar} />
      </Scrollable.Root>
    </Modal>
  );
};

export const InfoTable = ({
  onClose,
  docId,
  readonly,
}: {
  docId: string;
  onClose: () => void;
  readonly: boolean;
}) => {
  const t = useI18n();
  const manager = useContext(managerContext);
  const { docsSearchService } = useServices({
    DocsSearchService,
  });
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
      <TagsRow docId={docId} readonly={readonly} />
      <SortableProperties>
        {properties =>
          properties.length ? (
            <div>
              {properties
                .filter(
                  property =>
                    manager.isPropertyRequired(property.id) ||
                    (property.visibility !== 'hide' &&
                      !(
                        property.visibility === 'hide-if-empty' &&
                        !property.value
                      ))
                )
                .map(property => (
                  <PagePropertyRow
                    key={property.id}
                    property={property}
                    rowNameClassName={styles.rowNameContainer}
                  />
                ))}
            </div>
          ) : null
        }
      </SortableProperties>
      {manager.readonly ? null : <PagePropertiesAddProperty />}
    </div>
  );
};
