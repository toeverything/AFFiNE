import type { Workspace as BlockSuiteWorkspace } from '@blocksuite/store';
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

import type { PageMode } from '../../../atoms';
import { EditorModeSwitch } from '../block-suite-mode-switch';
import { PageHeaderMenuButton } from './operation-menu';
import * as styles from './styles.css';

export interface BlockSuiteHeaderTitleProps {
  blockSuiteWorkspace: BlockSuiteWorkspace;
  pageId: string;
  isPublic?: boolean;
  publicMode?: PageMode;
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
  blockSuiteWorkspace: workspace,
  pageId,
  onRename,
  isPublic,
  publicMode,
}: BlockSuiteHeaderTitleProps & {
  onRename?: () => void;
}) => {
  const currentPage = workspace.getPage(pageId);
  const pageMeta = useBlockSuitePageMeta(workspace).find(
    meta => meta.id === currentPage?.id
  );

  const title = pageMeta?.title;

  const handleRename = useCallback(() => {
    if (!isPublic && onRename) {
      onRename();
    }
  }, [isPublic, onRename]);

  return (
    <div className={styles.headerTitleContainer}>
      <EditorModeSwitch
        blockSuiteWorkspace={workspace}
        pageId={pageId}
        isPublic={isPublic}
        publicMode={publicMode}
      />
      <span
        data-testid="title-edit-button"
        className={styles.titleEditButton}
        onDoubleClick={handleRename}
      >
        {title || 'Untitled'}
      </span>
      {isPublic ? null : (
        <PageHeaderMenuButton rename={onRename} pageId={pageId} />
      )}
    </div>
  );
};

const BlockSuiteTitleWithRename = (props: BlockSuiteHeaderTitleProps) => {
  const { blockSuiteWorkspace: workspace, pageId } = props;
  const currentPage = workspace.getPage(pageId);
  const pageMeta = useBlockSuitePageMeta(workspace).find(
    meta => meta.id === currentPage?.id
  );
  const pageTitleMeta = usePageMetaHelper(workspace);

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
  if (props.isPublic) {
    return <StableTitle {...props} />;
  }
  return <BlockSuiteTitleWithRename {...props} />;
};

BlockSuiteHeaderTitle.displayName = 'BlockSuiteHeaderTitle';
