import { useBlockSuitePageReferences } from '@affine/core/hooks/use-block-suite-page-references';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { EdgelessIcon, PageIcon } from '@blocksuite/icons';
import { type DocCollection, type DocMeta } from '@blocksuite/store';
import * as Collapsible from '@radix-ui/react-collapsible';
import { PageRecordList, useLiveData, useService } from '@toeverything/infra';
import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';

import { MenuLinkItem } from '../../../app-sidebar';
import * as styles from '../favorite/styles.css';
import { PostfixItem } from './postfix-item';
export interface ReferencePageProps {
  docCollection: DocCollection;
  pageId: string;
  metaMapping: Record<string, DocMeta>;
  parentIds: Set<string>;
}

export const ReferencePage = ({
  docCollection,
  pageId,
  metaMapping,
  parentIds,
}: ReferencePageProps) => {
  const t = useAFFiNEI18N();
  const params = useParams();
  const active = params.pageId === pageId;

  const pageRecord = useLiveData(useService(PageRecordList).record(pageId));
  const pageMode = useLiveData(pageRecord?.mode);
  const icon = useMemo(() => {
    return pageMode === 'edgeless' ? <EdgelessIcon /> : <PageIcon />;
  }, [pageMode]);

  const references = useBlockSuitePageReferences(docCollection, pageId);
  const referencesToShow = useMemo(() => {
    return [
      ...new Set(
        references.filter(ref => metaMapping[ref] && !metaMapping[ref]?.trash)
      ),
    ];
  }, [references, metaMapping]);

  const [collapsed, setCollapsed] = useState(true);
  const collapsible = referencesToShow.length > 0;
  const nestedItem = parentIds.size > 0;

  const untitled = !metaMapping[pageId]?.title;
  const pageTitle = metaMapping[pageId]?.title || t['Untitled']();

  return (
    <Collapsible.Root
      className={styles.favItemWrapper}
      data-nested={nestedItem}
      open={!collapsed}
    >
      <MenuLinkItem
        data-type="reference-page"
        data-testid={`reference-page-${pageId}`}
        active={active}
        to={`/workspace/${docCollection.id}/${pageId}`}
        icon={icon}
        collapsed={collapsible ? collapsed : undefined}
        onCollapsedChange={setCollapsed}
        postfix={
          <PostfixItem
            docCollection={docCollection}
            pageId={pageId}
            pageTitle={pageTitle}
            isReferencePage={true}
          />
        }
      >
        <span className={styles.label} data-untitled={untitled}>
          {pageTitle}
        </span>
      </MenuLinkItem>
      {collapsible && (
        <Collapsible.Content className={styles.collapsibleContent}>
          <div className={styles.collapsibleContentInner}>
            {referencesToShow.map(ref => {
              return (
                <ReferencePage
                  key={ref}
                  docCollection={docCollection}
                  pageId={ref}
                  metaMapping={metaMapping}
                  parentIds={new Set([...parentIds, pageId])}
                />
              );
            })}
          </div>
        </Collapsible.Content>
      )}
    </Collapsible.Root>
  );
};
