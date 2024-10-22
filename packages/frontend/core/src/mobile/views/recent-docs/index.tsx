import { useBlockSuiteDocMeta } from '@affine/core/components/hooks/use-block-suite-page-meta';
import { useService, WorkspaceService } from '@toeverything/infra';
import { useMemo } from 'react';

import { DocCard } from '../../components/doc-card';
import { CollapsibleSection } from '../../components/explorer';
import * as styles from './styles.css';

export const RecentDocs = ({ max = 5 }: { max?: number }) => {
  const workspace = useService(WorkspaceService).workspace;
  const allPageMetas = useBlockSuiteDocMeta(workspace.docCollection);

  const cardMetas = useMemo(() => {
    return [...allPageMetas]
      .filter(meta => !meta.trash)
      .sort((a, b) => (b.updatedDate ?? 0) - (a.updatedDate ?? 0))
      .slice(0, max);
  }, [allPageMetas, max]);

  if (!cardMetas.length) {
    return null;
  }

  return (
    <CollapsibleSection
      name="recent"
      title="Recent"
      headerClassName={styles.header}
      className={styles.recentSection}
      testId="recent-docs"
    >
      <div className={styles.scroll} data-testid="recent-docs-list">
        <ul className={styles.list}>
          {cardMetas.map((doc, index) => (
            <li key={index} className={styles.cardWrapper}>
              <DocCard meta={doc} />
            </li>
          ))}
        </ul>
      </div>
    </CollapsibleSection>
  );
};
