import { Content } from '@affine/component';
import { assertExists } from '@blocksuite/store';
import { useSetAtom } from 'jotai';
import React, { useState } from 'react';

import { openQuickSearchModalAtom } from '../../../atoms';
import { usePageMeta } from '../../../hooks/use-page-meta';
import { BlockSuiteWorkspace } from '../../../shared';
import { PageNotFoundError } from '../../affine/affine-error-eoundary';
import { EditorModeSwitch } from './editor-mode-switch';
import Header from './header';
import { QuickSearchButton } from './quick-search-button';
import {
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
  const [isHover, setIsHover] = useState(false);
  const { trash: isTrash } = pageMeta;
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
      {title && (
        <StyledTitle
          data-tauri-drag-region
          onMouseEnter={() => {
            if (isTrash) return;

            setIsHover(true);
          }}
          onMouseLeave={() => {
            if (isTrash) return;

            setIsHover(false);
          }}
        >
          <StyledTitleWrapper>
            <StyledSwitchWrapper>
              <EditorModeSwitch
                blockSuiteWorkspace={blockSuiteWorkspace}
                pageId={pageId}
                isHover={isHover}
                style={{
                  marginRight: '12px',
                }}
              />
            </StyledSwitchWrapper>
            <Content ellipsis={true}>{title}</Content>
            <StyledSearchArrowWrapper>
              <QuickSearchButton
                onClick={() => {
                  setOpenQuickSearch(true);
                }}
              />
            </StyledSearchArrowWrapper>
          </StyledTitleWrapper>
        </StyledTitle>
      )}
    </Header>
  );
};
