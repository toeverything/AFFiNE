import { assertExists } from '@blocksuite/global/utils';
import { useBlockSuitePageMeta } from '@toeverything/hooks/use-block-suite-page-meta';
import { useSetAtom } from 'jotai';
import type {
  FC,
  HTMLAttributes,
  PropsWithChildren,
  ReactElement,
} from 'react';
import { useRef } from 'react';

import { openQuickSearchModalAtom } from '../../../atoms';
import { QuickSearchButton } from '../../pure/quick-search-button';
import { EditorModeSwitch } from './editor-mode-switch';
import type { BaseHeaderProps } from './header';
import { Header } from './header';
import * as styles from './styles.css';

export type WorkspaceHeaderProps = BaseHeaderProps;

export const BlockSuiteEditorHeader: FC<
  PropsWithChildren<WorkspaceHeaderProps> & HTMLAttributes<HTMLDivElement>
> = (props): ReactElement => {
  const { workspace, currentPage, children, isPublic } = props;
  // fixme(himself65): remove this atom and move it to props
  const setOpenQuickSearch = useSetAtom(openQuickSearchModalAtom);
  const pageMeta = useBlockSuitePageMeta(workspace.blockSuiteWorkspace).find(
    meta => meta.id === currentPage?.id
  );
  const headerRef = useRef<HTMLDivElement>(null);
  assertExists(pageMeta);
  const title = pageMeta.title;

  return (
    <Header ref={headerRef} {...props}>
      {children}
      {!isPublic && currentPage && (
        <div className={styles.titleContainer}>
          <div className={styles.titleWrapper}>
            <div className={styles.switchWrapper}>
              <EditorModeSwitch
                blockSuiteWorkspace={workspace.blockSuiteWorkspace}
                pageId={currentPage.id}
                style={{
                  marginRight: '12px',
                }}
              />
            </div>
            <div className={styles.title}>{title || 'Untitled'}</div>

            <div className={styles.searchArrowWrapper}>
              <QuickSearchButton
                onClick={() => {
                  setOpenQuickSearch(true);
                }}
              />
            </div>
          </div>
        </div>
      )}
    </Header>
  );
};

BlockSuiteEditorHeader.displayName = 'BlockSuiteEditorHeader';
