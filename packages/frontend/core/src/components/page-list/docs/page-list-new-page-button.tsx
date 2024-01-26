import { waitForCurrentWorkspaceAtom } from '@affine/core/modules/workspace';
import { useAtomValue } from 'jotai';
import type { PropsWithChildren } from 'react';

import { usePageHelper } from '../../blocksuite/block-suite-page-list/utils';
import { NewPageButton } from '../components/new-page-button';
import * as styles from './page-list-new-page-button.css';

export const PageListNewPageButton = ({
  className,
  children,
  size,
  testId,
}: PropsWithChildren<{
  className?: string;
  size?: 'small' | 'default';
  testId?: string;
}>) => {
  const currentWorkspace = useAtomValue(waitForCurrentWorkspaceAtom);
  const { importFile, createEdgeless, createPage } = usePageHelper(
    currentWorkspace.blockSuiteWorkspace
  );
  return (
    <div className={className} data-testid={testId}>
      <NewPageButton
        size={size}
        importFile={importFile}
        createNewEdgeless={createEdgeless}
        createNewPage={createPage}
      >
        <div className={styles.newPageButtonLabel}>{children}</div>
      </NewPageButton>
    </div>
  );
};
