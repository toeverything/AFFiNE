import { PopperProps, QuickSearchTips } from '@affine/component';
import { getEnvironment } from '@affine/env';
import { ArrowDownSmallIcon } from '@blocksuite/icons';
import { assertExists } from '@blocksuite/store';
import { useAtomValue, useSetAtom } from 'jotai';
import { forwardRef, HTMLAttributes, useCallback, useRef } from 'react';

import { currentEditorAtom, openQuickSearchModalAtom } from '../../../atoms';
import { useOpenTips } from '../../../hooks/affine/use-is-first-load';
import { usePageMeta } from '../../../hooks/use-page-meta';
import { useElementResizeEffect } from '../../../hooks/use-workspaces';
import { BlockSuiteWorkspace } from '../../../shared';
import { PageNotFoundError } from '../../affine/affine-error-eoundary';
import { QuickSearchButton } from '../../pure/quick-search-button';
import { EditorModeSwitch } from './editor-mode-switch';
import Header from './header';
import {
  StyledQuickSearchTipButton,
  StyledQuickSearchTipContent,
  StyledSearchArrowWrapper,
  StyledSwitchWrapper,
  StyledTitle,
  StyledTitleContainer,
  StyledTitleWrapper,
} from './styles';

export type BlockSuiteEditorHeaderProps = React.PropsWithChildren<{
  blockSuiteWorkspace: BlockSuiteWorkspace;
  pageId: string;
  isPublic?: boolean;
  isPreview?: boolean;
}>;

export const BlockSuiteEditorHeader = forwardRef<
  HTMLDivElement,
  BlockSuiteEditorHeaderProps & HTMLAttributes<HTMLDivElement>
>(
  (
    { blockSuiteWorkspace, pageId, children, isPublic, isPreview, ...props },
    ref
  ) => {
    const page = blockSuiteWorkspace.getPage(pageId);
    // fixme(himself65): remove this atom and move it to props
    const setOpenQuickSearch = useSetAtom(openQuickSearchModalAtom);
    if (!page) {
      throw new PageNotFoundError(blockSuiteWorkspace, pageId);
    }
    const pageMeta = usePageMeta(blockSuiteWorkspace).find(
      meta => meta.id === pageId
    );
    assertExists(pageMeta);
    const title = pageMeta.title;
    const { trash: isTrash } = pageMeta;
    const [openTips, setOpenTips] = useOpenTips();
    const isMac = () => {
      const env = getEnvironment();
      return env.isBrowser && env.isMacOs;
    };

    const popperRef: PopperProps['popperRef'] = useRef(null);

    useElementResizeEffect(
      useAtomValue(currentEditorAtom),
      useCallback(() => {
        if (!openTips || !popperRef.current) {
          return;
        }
        popperRef.current.update();
      }, [openTips])
    );

    const TipsContent = (
      <StyledQuickSearchTipContent>
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
        <StyledQuickSearchTipButton
          data-testid="quick-search-got-it"
          onClick={() => setOpenTips(false)}
        >
          Got it
        </StyledQuickSearchTipButton>
      </StyledQuickSearchTipContent>
    );

    return (
      <Header
        ref={ref}
        rightItems={
          // fixme(himself65): other right items not supported in public mode
          isPublic || isPreview
            ? ['themeModeSwitch']
            : isTrash
            ? ['trashButtonGroup']
            : ['syncUser', 'themeModeSwitch', 'editorOptionMenu']
        }
        {...props}
      >
        {children}
        {!isPublic && (
          <StyledTitleContainer data-tauri-drag-region>
            <StyledTitleWrapper>
              <StyledSwitchWrapper>
                <EditorModeSwitch
                  blockSuiteWorkspace={blockSuiteWorkspace}
                  pageId={pageId}
                  style={{
                    marginRight: '12px',
                  }}
                />
              </StyledSwitchWrapper>
              <StyledTitle>{title || 'Untitled'}</StyledTitle>
              <QuickSearchTips
                data-testid="quick-search-tips"
                content={TipsContent}
                placement="bottom"
                popperRef={popperRef}
                open={openTips}
                offset={[0, -5]}
              >
                <StyledSearchArrowWrapper>
                  <QuickSearchButton
                    onClick={() => {
                      setOpenQuickSearch(true);
                    }}
                  />
                </StyledSearchArrowWrapper>
              </QuickSearchTips>
            </StyledTitleWrapper>
          </StyledTitleContainer>
        )}
      </Header>
    );
  }
);

BlockSuiteEditorHeader.displayName = 'BlockSuiteEditorHeader';
