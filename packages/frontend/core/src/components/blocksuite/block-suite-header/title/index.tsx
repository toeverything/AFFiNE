import { InlineEdit, type InlineEditProps } from '@affine/component';
import {
  useBlockSuiteDocMeta,
  useDocMetaHelper,
} from '@affine/core/hooks/use-block-suite-page-meta';
import type { BlockSuiteWorkspace } from '@affine/core/shared';
import type { HTMLAttributes } from 'react';
import { useCallback } from 'react';

import * as styles from './style.css';

export interface BlockSuiteHeaderTitleProps {
  blockSuiteWorkspace: BlockSuiteWorkspace;
  pageId: string;
  /** if set, title cannot be edited */
  isPublic?: boolean;
  inputHandleRef?: InlineEditProps['handleRef'];
}

const inputAttrs = {
  'data-testid': 'title-content',
} as HTMLAttributes<HTMLInputElement>;
export const BlocksuiteHeaderTitle = (props: BlockSuiteHeaderTitleProps) => {
  const {
    blockSuiteWorkspace: workspace,
    pageId,
    isPublic,
    inputHandleRef,
  } = props;
  const currentPage = workspace.getDoc(pageId);
  const pageMeta = useBlockSuiteDocMeta(workspace).find(
    meta => meta.id === currentPage?.id
  );
  const title = pageMeta?.title;
  const { setDocTitle } = useDocMetaHelper(workspace);

  const onChange = useCallback(
    (v: string) => {
      setDocTitle(currentPage?.id || '', v);
    },
    [currentPage?.id, setDocTitle]
  );

  return (
    <InlineEdit
      className={styles.title}
      autoSelect
      value={title}
      onChange={onChange}
      editable={!isPublic}
      placeholder="Untitled"
      data-testid="title-edit-button"
      handleRef={inputHandleRef}
      inputAttrs={inputAttrs}
    />
  );
};
