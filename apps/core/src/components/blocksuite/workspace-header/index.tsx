import { Button } from '@affine/component';
import { assertExists } from '@blocksuite/global/utils';
import {
  useBlockSuitePageMeta,
  usePageMetaHelper,
} from '@toeverything/hooks/use-block-suite-page-meta';
import { useSetAtom } from 'jotai';
import type {
  FC,
  HTMLAttributes,
  PropsWithChildren,
  ReactElement,
} from 'react';
import { useCallback, useRef, useState } from 'react';

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
            <div>
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
                  />
                  <Button
                    onClick={handleClick}
                    data-testid="save-edit-button"
                    style={{
                      marginLeft: '12px',
                    }}
                  >
                    Save
                  </Button>
                </div>
              ) : (
                <span
                  data-testid="title-edit-button"
                  onClick={handleClick}
                  style={{ cursor: 'pointer' }}
                >
                  {title || 'Untitled'}
                </span>
              )}
            </div>
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
