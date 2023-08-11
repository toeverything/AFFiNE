import { WorkspaceFlavour } from '@affine/env/workspace';
import {
  useBlockSuitePageMeta,
  usePageMetaHelper,
} from '@toeverything/hooks/use-block-suite-page-meta';
import {
  type FocusEvent,
  type InputHTMLAttributes,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useState,
} from 'react';

import type { AffineOfficialWorkspace } from '../../../shared';
import { EditorModeSwitch } from '../block-suite-mode-switch';
import { PageMenu } from './operation-menu';
import * as styles from './styles.css';

export interface BlockSuiteHeaderTitleProps {
  workspace: AffineOfficialWorkspace;
  pageId: string;
}

const EditableTitle = ({
  value,
  onFocus: propsOnFocus,
  ...inputProps
}: InputHTMLAttributes<HTMLInputElement>) => {
  const onFocus = useCallback(
    (e: FocusEvent<HTMLInputElement>) => {
      e.target.select();
      propsOnFocus?.(e);
    },
    [propsOnFocus]
  );
  return (
    <div className={styles.headerTitleContainer}>
      <input
        className={styles.titleInput}
        autoFocus={true}
        value={value}
        type="text"
        data-testid="title-content"
        onFocus={onFocus}
        {...inputProps}
      />
      <span className={styles.shadowTitle}>{value}</span>
    </div>
  );
};

const StableTitle = ({
  workspace,
  pageId,
  onRename,
}: BlockSuiteHeaderTitleProps & {
  onRename?: () => void;
}) => {
  const currentPage = workspace.blockSuiteWorkspace.getPage(pageId);
  const pageMeta = useBlockSuitePageMeta(workspace.blockSuiteWorkspace).find(
    meta => meta.id === currentPage?.id
  );

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
      <span
        data-testid="title-edit-button"
        className={styles.titleEditButton}
        onClick={onRename}
      >
        {title || 'Untitled'}
      </span>
      <PageMenu rename={onRename} pageId={pageId} />
    </div>
  );
};

const BlockSuiteTitleWithRename = (props: BlockSuiteHeaderTitleProps) => {
  const { workspace, pageId } = props;
  const currentPage = workspace.blockSuiteWorkspace.getPage(pageId);
  const pageMeta = useBlockSuitePageMeta(workspace.blockSuiteWorkspace).find(
    meta => meta.id === currentPage?.id
  );
  const pageTitleMeta = usePageMetaHelper(workspace.blockSuiteWorkspace);

  const [isEditable, setIsEditable] = useState(false);
  const [title, setPageTitle] = useState(pageMeta?.title || 'Untitled');

  const onRename = useCallback(() => {
    setIsEditable(true);
  }, []);

  const onBlur = useCallback(() => {
    setIsEditable(false);
    if (!currentPage?.id) {
      return;
    }
    pageTitleMeta.setPageTitle(currentPage.id, title);
  }, [currentPage?.id, pageTitleMeta, title]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' || e.key === 'Escape') {
        onBlur();
      }
    },
    [onBlur]
  );

  useEffect(() => {
    setPageTitle(pageMeta?.title || '');
  }, [pageMeta?.title]);

  if (isEditable) {
    return (
      <EditableTitle
        onBlur={onBlur}
        value={title}
        onKeyDown={handleKeyDown}
        onChange={e => {
          const value = e.target.value;
          setPageTitle(value);
        }}
      />
    );
  }

  return <StableTitle {...props} onRename={onRename} />;
};

export const BlockSuiteHeaderTitle = (props: BlockSuiteHeaderTitleProps) => {
  if (props.workspace.flavour === WorkspaceFlavour.PUBLIC) {
    return <StableTitle {...props} />;
  }
  return <BlockSuiteTitleWithRename {...props} />;
};

BlockSuiteHeaderTitle.displayName = 'BlockSuiteHeaderTitle';
