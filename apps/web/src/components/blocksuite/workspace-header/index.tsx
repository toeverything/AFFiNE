import type { PopperProps } from '@affine/component';
import { QuickSearchTips } from '@affine/component';
import { getEnvironment } from '@affine/env';
import { ArrowDownSmallIcon } from '@blocksuite/icons';
import { assertExists } from '@blocksuite/store';
import { useBlockSuitePageMeta } from '@toeverything/hooks/use-block-suite-page-meta';
import { useAtom, useSetAtom } from 'jotai';
import type {
  FC,
  HTMLAttributes,
  PropsWithChildren,
  ReactElement,
} from 'react';
import { useEffect, useRef } from 'react';

import { openQuickSearchModalAtom } from '../../../atoms';
import { guideQuickSearchTipsAtom } from '../../../atoms/guide';
import { QuickSearchButton } from '../../pure/quick-search-button';
import { EditorModeSwitch } from './editor-mode-switch';
import type { BaseHeaderProps } from './header';
import { Header } from './header';
import * as styles from './styles.css';

export type WorkspaceHeaderProps = BaseHeaderProps;

const isMac = () => {
  const env = getEnvironment();
  return env.isBrowser && env.isMacOs;
};

export const WorkspaceHeader: FC<
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

  const popperRef: PopperProps['popperRef'] = useRef(null);

  const [showQuickSearchTips, setShowQuickSearchTips] = useAtom(
    guideQuickSearchTipsAtom
  );

  useEffect(() => {
    if (!headerRef.current) {
      return;
    }
    const resizeObserver = new ResizeObserver(() => {
      if (showQuickSearchTips || !popperRef.current) {
        return;
      }
      popperRef.current.update();
    });
    resizeObserver.observe(headerRef.current);
    return () => {
      resizeObserver.disconnect();
    };
  }, [showQuickSearchTips]);

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
};

WorkspaceHeader.displayName = 'BlockSuiteEditorHeader';
