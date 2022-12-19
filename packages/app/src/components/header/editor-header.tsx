import React, { useEffect, useState } from 'react';
import {
  StyledSearchArrowWrapper,
  StyledSwitchWrapper,
  StyledTitle,
  StyledTitleWrapper,
} from './styles';
import { Content } from '@/ui/layout';
import { useEditor } from '@/providers/editor-provider';
import { useAppState } from '@/providers/app-state-provider/context';
import EditorModeSwitch from '@/components/editor-mode-switch';
import QuickSearchButton from './quick-search-button';
import Header from './header';

export const EditorHeader = () => {
  const [title, setTitle] = useState('');
  const [isHover, setIsHover] = useState(false);
  const { getPageMeta, currentPage, editor } = useAppState();

  const { onPropsUpdated } = useEditor();

  useEffect(() => {
    onPropsUpdated(editor => {
      setTitle(editor.model?.title || 'Untitled');
    });
  }, [onPropsUpdated]);

  useEffect(() => {
    setTimeout(() => {
      // If first time in, need to wait for editor to be inserted into DOM
      setTitle(editor?.model?.title || 'Untitled');
    }, 300);
  }, [editor]);

  const pageMeta = currentPage?.pageId ? getPageMeta(currentPage.pageId) : null;

  return (
    <Header>
      {title && (
        <StyledTitle
          onMouseEnter={() => {
            if (pageMeta?.trash) return;

            setIsHover(true);
          }}
          onMouseLeave={() => {
            if (pageMeta?.trash) return;

            setIsHover(false);
          }}
        >
          <StyledTitleWrapper>
            <StyledSwitchWrapper>
              <EditorModeSwitch
                isHover={isHover}
                style={{
                  marginRight: '12px',
                }}
              />
            </StyledSwitchWrapper>
            <Content ellipsis={true}>{title}</Content>
            <StyledSearchArrowWrapper>
              <QuickSearchButton />
            </StyledSearchArrowWrapper>
          </StyledTitleWrapper>
        </StyledTitle>
      )}
    </Header>
  );
};

export default EditorHeader;
