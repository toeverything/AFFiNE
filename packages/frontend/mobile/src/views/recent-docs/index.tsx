import { useBlockSuiteDocMeta } from '@affine/core/hooks/use-block-suite-page-meta';
import { CollapsibleSection } from '@affine/core/modules/explorer';
import { useService, WorkspaceService } from '@toeverything/infra';
import { useMemo } from 'react';

import { DocCard } from '../../components/doc-card';
import * as styles from './styles.css';

export const RecentDocs = ({ max = 5 }: { max?: number }) => {
  const workspace = useService(WorkspaceService).workspace;
  const allPageMetas = useBlockSuiteDocMeta(workspace.docCollection);

  const cardMetas = useMemo(() => {
    return [...allPageMetas]
      .sort((a, b) => (b.updatedDate ?? 0) - (a.updatedDate ?? 0))
      .slice(0, max);
  }, [allPageMetas, max]);

  return (
    <CollapsibleSection
      name="recent"
      title="Recent"
      headerClassName={styles.header}
    >
      <div className={styles.scroll}>
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
