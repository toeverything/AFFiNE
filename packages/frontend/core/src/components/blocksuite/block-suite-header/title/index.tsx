import type { InlineEditProps } from '@affine/component';
import { InlineEdit } from '@affine/component';
import {
  useBlockSuiteDocMeta,
  useDocMetaHelper,
} from '@affine/core/hooks/use-block-suite-page-meta';
import type { DocCollection } from '@affine/core/shared';
import clsx from 'clsx';
import type { HTMLAttributes } from 'react';
import { useCallback } from 'react';

import * as styles from './style.css';

export interface BlockSuiteHeaderTitleProps {
  docCollection: DocCollection;
  pageId: string;
  /** if set, title cannot be edited */
  isPublic?: boolean;
  inputHandleRef?: InlineEditProps['handleRef'];
  className?: string;
  onEditSave?: () => void;
}

const inputAttrs = {
  'data-testid': 'title-content',
} as HTMLAttributes<HTMLInputElement>;
export const BlocksuiteHeaderTitle = (props: BlockSuiteHeaderTitleProps) => {
  const { docCollection, pageId, isPublic, inputHandleRef, onEditSave } = props;
  const currentPage = docCollection.getDoc(pageId);
  const pageMeta = useBlockSuiteDocMeta(docCollection).find(
    meta => meta.id === currentPage?.id
  );
  const title = pageMeta?.title;
  const { setDocTitle } = useDocMetaHelper(docCollection);

  const onChange = useCallback(
    (v: string) => {
      onEditSave?.();
      setDocTitle(currentPage?.id || '', v);
    },
    [currentPage?.id, onEditSave, setDocTitle]
  );

  return (
    <InlineEdit
      className={clsx(styles.title, props.className)}
      autoSelect
      value={title}
      onChange={onChange}
      editable={!isPublic}
      exitible={true}
      placeholder="Untitled"
      data-testid="title-edit-button"
      handleRef={inputHandleRef}
      inputAttrs={inputAttrs}
    />
  );
};
