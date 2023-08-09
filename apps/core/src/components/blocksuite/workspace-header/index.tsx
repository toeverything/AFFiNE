import { assertExists } from '@blocksuite/global/utils';
import {
  useBlockSuitePageMeta,
  usePageMetaHelper,
} from '@toeverything/hooks/use-block-suite-page-meta';
import type { HTMLAttributes, ReactElement, ReactNode } from 'react';
import { useCallback, useRef, useState } from 'react';

import { EditorModeSwitch } from './editor-mode-switch';
import type { BaseHeaderProps } from './header';
import { Header } from './header';
import { PageMenu } from './header-right-items/editor-option-menu';
import * as styles from './styles.css';

export interface WorkspaceHeaderProps
  extends BaseHeaderProps,
    HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
}

export const BlockSuiteEditorHeader = (
  props: WorkspaceHeaderProps
): ReactElement => {
  const { workspace, currentPage, children, isPublic } = props;
  // fixme(himself65): remove this atom and move it to props
  const pageMeta = useBlockSuitePageMeta(workspace.blockSuiteWorkspace).find(
    meta => meta.id === currentPage?.id
  );
  const pageTitleMeta = usePageMetaHelper(workspace.blockSuiteWorkspace);
  const [isEditable, setIsEditable] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const handleClick = useCallback(() => {
    if (isEditable) {
      setIsEditable(!isEditable);
      const value = inputRef.current?.value;
      if (value !== pageMeta?.title && currentPage) {
        pageTitleMeta.setPageTitle(currentPage?.id, value || '');
      }
    } else {
      setIsEditable(!isEditable);
    }
  }, [currentPage, isEditable, pageMeta?.title, pageTitleMeta]);
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' || e.key === 'Escape') {
        handleClick();
      }
    },
    [handleClick]
  );
  const headerRef = useRef<HTMLDivElement>(null);
  assertExists(pageMeta);
  const title = pageMeta?.title;

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
            <div className={styles.pageTitle}>
              {isEditable ? (
                <div>
                  <input
                    autoFocus={true}
                    className={styles.title}
                    type="text"
                    data-testid="title-content"
                    defaultValue={pageMeta?.title}
                    onBlur={handleClick}
                    ref={inputRef}
                    onKeyDown={handleKeyDown}
                  />
                </div>
              ) : (
                <span data-testid="title-edit-button" onClick={handleClick}>
                  {title || 'Untitled'}
                </span>
              )}
            </div>
            <div className={styles.searchArrowWrapper}>
              <PageMenu rename={handleClick} />
            </div>
          </div>
        </div>
      )}
    </Header>
  );
};

BlockSuiteEditorHeader.displayName = 'BlockSuiteEditorHeader';
