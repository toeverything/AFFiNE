import { WorkspaceFlavour } from '@affine/env/workspace';
import { assertExists } from '@blocksuite/global/utils';
import {
  useBlockSuitePageMeta,
  usePageMetaHelper,
} from '@toeverything/hooks/use-block-suite-page-meta';
import { useCallback, useRef, useState } from 'react';

import type { AffineOfficialWorkspace } from '../../../shared';
import { EditorModeSwitch } from '../block-suite-mode-switch';
import { PageMenu } from './operation-menu';
import * as styles from './styles.css';

export interface BlockSuiteHeaderTitleProps {
  workspace: AffineOfficialWorkspace;
  pageId: string;
}
export const BlockSuiteEditableTitle = ({
  workspace,
  pageId,
}: BlockSuiteHeaderTitleProps) => {
  const currentPage = workspace.blockSuiteWorkspace.getPage(pageId);
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
  assertExists(pageMeta);
  const title = pageMeta?.title;

  return (
    <div className={styles.headerTitleContainer}>
      <EditorModeSwitch
        blockSuiteWorkspace={workspace.blockSuiteWorkspace}
        pageId={pageId}
        style={{
          marginRight: '12px',
        }}
      />
      {isEditable ? (
        <input
          autoFocus={true}
          // className={styles.title}
          type="text"
          data-testid="title-content"
          defaultValue={pageMeta?.title}
          onBlur={handleClick}
          ref={inputRef}
          onKeyDown={handleKeyDown}
        />
      ) : (
        <span data-testid="title-edit-button" onClick={handleClick}>
          {title || 'Untitled'}
        </span>
      )}
      <PageMenu rename={handleClick} pageId={pageId} />
    </div>
  );
};

export const BlockSuiteHeaderTitle = (props: BlockSuiteHeaderTitleProps) => {
  if (props.workspace.flavour === WorkspaceFlavour.PUBLIC) {
    return null;
  }
  return <BlockSuiteEditableTitle {...props} />;
};

BlockSuiteHeaderTitle.displayName = 'BlockSuiteHeaderTitle';
