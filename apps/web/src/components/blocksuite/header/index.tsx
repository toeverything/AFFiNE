import { Content, QuickSearchTips } from '@affine/component';
import { getEnvironment } from '@affine/env';
import { ArrowDownSmallIcon } from '@blocksuite/icons';
import { assertExists } from '@blocksuite/store';
import { useSetAtom } from 'jotai';
import React from 'react';

import { openQuickSearchModalAtom } from '../../../atoms';
import { useOpenTips } from '../../../hooks/affine/use-is-first-load';
import { usePageMeta } from '../../../hooks/use-page-meta';
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
  StyledTitleWrapper,
} from './styles';

export type BlockSuiteEditorHeaderProps = React.PropsWithChildren<{
  blockSuiteWorkspace: BlockSuiteWorkspace;
  pageId: string;
  isPublic?: boolean;
  isPreview?: boolean;
}>;

export const BlockSuiteEditorHeader: React.FC<BlockSuiteEditorHeaderProps> = ({
  blockSuiteWorkspace,
  pageId,
  children,
  isPublic,
  isPreview,
}) => {
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
  const tipsContent = () => {
    return (
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
  };
  return (
    <Header
      rightItems={
        // fixme(himself65): other right items not supported in public mode
        isPublic || isPreview
          ? ['themeModeSwitch']
          : isTrash
          ? ['trashButtonGroup']
          : ['syncUser', 'themeModeSwitch', 'editorOptionMenu']
      }
    >
      {children}
      {!isPublic && (
        <StyledTitle data-tauri-drag-region>
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
            <Content ellipsis={true}>{title || 'Untitled'}</Content>
            <QuickSearchTips
              data-testid="quick-search-tips"
              content={tipsContent()}
              placement="bottom"
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
        </StyledTitle>
      )}
    </Header>
  );
};
