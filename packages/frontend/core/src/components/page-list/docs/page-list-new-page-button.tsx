import type { PropsWithChildren } from 'react';

import { NewPageButton } from '../components/new-page-button';
import * as styles from './page-list-new-page-button.css';

export const PageListNewPageButton = ({
  className,
  children,
  size,
  testId,
  onCreatePage,
  onCreateEdgeless,
  onImportFile,
}: PropsWithChildren<{
  className?: string;
  size?: 'small' | 'default';
  testId?: string;
  onCreatePage: () => void;
  onCreateEdgeless: () => void;
  onImportFile?: () => void;
}>) => {
  return (
    <div className={className} data-testid={testId}>
      <NewPageButton
        size={size}
        importFile={onImportFile}
        createNewEdgeless={onCreateEdgeless}
        createNewPage={onCreatePage}
      >
        <div className={styles.newPageButtonLabel}>{children}</div>
      </NewPageButton>
    </div>
  );
};
