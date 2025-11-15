import type { MouseEvent, PropsWithChildren } from 'react';

import { NewPageButton } from '../components/new-page-button';
import * as styles from './page-list-new-page-button.css';

export const PageListNewPageButton = ({
  className,
  children,
  size,
  onCreateDoc,
  onCreatePage,
  onCreateEdgeless,
  onImportFile,
  ...props
}: PropsWithChildren<{
  className?: string;
  size?: 'small' | 'default';
  onCreateDoc: (e?: MouseEvent) => void;
  onCreatePage: (e?: MouseEvent) => void;
  onCreateEdgeless: (e?: MouseEvent) => void;
  onImportFile?: (e?: MouseEvent) => void;
}> &
  React.HTMLAttributes<HTMLDivElement>) => {
  return (
    <div className={className} {...props}>
      <NewPageButton
        size={size}
        importFile={onImportFile}
        createNewDoc={onCreateDoc}
        createNewEdgeless={onCreateEdgeless}
        createNewPage={onCreatePage}
      >
        <div className={styles.newPageButtonLabel}>{children}</div>
      </NewPageButton>
    </div>
  );
};
