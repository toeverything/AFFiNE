import type { PopperProps } from '@affine/component';
import { QuickSearchTips } from '@affine/component';
import { getEnvironment } from '@affine/env';
import { ArrowDownSmallIcon } from '@blocksuite/icons';
import { assertExists } from '@blocksuite/store';
import { useBlockSuitePageMeta } from '@toeverything/hooks/use-block-suite-page-meta';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import type { HTMLAttributes, PropsWithChildren } from 'react';
import { forwardRef, useCallback, useRef } from 'react';

import { currentEditorAtom, openQuickSearchModalAtom } from '../../../atoms';
import { guideQuickSearchTipsAtom } from '../../../atoms/guide';
import { useElementResizeEffect } from '../../../hooks/use-workspaces';
import { QuickSearchButton } from '../../pure/quick-search-button';
import { EditorModeSwitch } from './editor-mode-switch';
import type { BaseHeaderProps } from './header';
import { Header } from './header';
import * as styles from './styles.css';

export type WorkspaceHeaderProps = BaseHeaderProps;

export const WorkspaceHeader = forwardRef<
  HTMLDivElement,
  PropsWithChildren<WorkspaceHeaderProps> & HTMLAttributes<HTMLDivElement>
>((props, ref) => {
  const { workspace, currentPage, children, isPublic } = props;
  // fixme(himself65): remove this atom and move it to props
  const setOpenQuickSearch = useSetAtom(openQuickSearchModalAtom);
  const pageMeta = useBlockSuitePageMeta(workspace.blockSuiteWorkspace).find(
    meta => meta.id === currentPage?.id
  );
  assertExists(pageMeta);
  const title = pageMeta.title;
  const isMac = () => {
    const env = getEnvironment();
    return env.isBrowser && env.isMacOs;
  };

  const popperRef: PopperProps['popperRef'] = useRef(null);

  const [showQuickSearchTips, setShowQuickSearchTips] = useAtom(
    guideQuickSearchTipsAtom
  );

  useElementResizeEffect(
    useAtomValue(currentEditorAtom),
    useCallback(() => {
      if (showQuickSearchTips || !popperRef.current) {
        return;
      }
      popperRef.current.update();
    }, [showQuickSearchTips])
  );

  const TipsContent = (
    <div className={styles.quickSearchTipContent}>
      <div>
        Click button
        {
          <span
            style={{
              fontSize: '24px',
              verticalAlign: 'middle',
            }}
          >
            <ArrowDownSmallIcon />
          </span>
        }
        or use
        {isMac() ? ' ⌘ + K' : ' Ctrl + K'} to activate Quick Search. Then you
        can search keywords or quickly open recently viewed pages.
      </div>
      <div
        className={styles.quickSearchTipButton}
        data-testid="quick-search-got-it"
        onClick={() => setShowQuickSearchTips(false)}
      >
        Got it
      </div>
    </div>
  );

  return (
    <Header ref={ref} {...props}>
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
            <QuickSearchTips
              data-testid="quick-search-tips"
              content={TipsContent}
              placement="bottom"
              popperRef={popperRef}
              open={showQuickSearchTips}
              offset={[0, -5]}
            >
              <div className={styles.searchArrowWrapper}>
                <QuickSearchButton
                  onClick={() => {
                    setOpenQuickSearch(true);
                  }}
                />
              </div>
            </QuickSearchTips>
          </div>
        </div>
      )}
    </Header>
  );
});

WorkspaceHeader.displayName = 'BlockSuiteEditorHeader';
