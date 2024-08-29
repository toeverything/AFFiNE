import { Divider, Scrollable } from '@affine/component';
import {
  PagePropertyRow,
  SortableProperties,
  usePagePropertiesManager,
} from '@affine/core/components/affine/page-properties';
import { managerContext } from '@affine/core/components/affine/page-properties/common';
import { LinksRow } from '@affine/core/components/affine/page-properties/info-modal/links-row';
import { TagsRow } from '@affine/core/components/affine/page-properties/info-modal/tags-row';
import { TimeRow } from '@affine/core/components/affine/page-properties/info-modal/time-row';
import { DocsSearchService } from '@affine/core/modules/docs-search';
import { useI18n } from '@affine/i18n';
import { LiveData, useLiveData, useService } from '@toeverything/infra';
import { Suspense, useMemo } from 'react';

import * as styles from './doc-info.css';

export const DocInfoSheet = ({ docId }: { docId: string }) => {
  const manager = usePagePropertiesManager(docId);
  const docsSearchService = useService(DocsSearchService);
  const t = useI18n();

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
    <Scrollable.Root>
      <Scrollable.Viewport
        className={styles.viewport}
        data-testid="doc-info-menu"
      >
        <managerContext.Provider value={manager}>
          <Suspense>
            <TimeRow docId={docId} className={styles.timeRow} />
            <Divider size="thinner" />
            {backlinks && backlinks.length > 0 ? (
              <>
                <LinksRow
                  className={styles.linksRow}
                  references={backlinks}
                  label={t['com.affine.page-properties.backlinks']()}
                />
                <Divider size="thinner" />
              </>
            ) : null}
            {links && links.length > 0 ? (
              <>
                <LinksRow
                  className={styles.linksRow}
                  references={links}
                  label={t['com.affine.page-properties.outgoing-links']()}
                />
                <Divider size="thinner" />
              </>
            ) : null}
            <div className={styles.properties}>
              <TagsRow docId={docId} readonly={manager.readonly} />
              <SortableProperties>
                {properties =>
                  properties.length ? (
                    <>
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
                    </>
                  ) : null
                }
              </SortableProperties>
            </div>
          </Suspense>
        </managerContext.Provider>
      </Scrollable.Viewport>
      <Scrollable.Scrollbar className={styles.scrollBar} />
    </Scrollable.Root>
  );
};
